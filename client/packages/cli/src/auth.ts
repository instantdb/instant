import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { getAuthPaths } from './util/getAuthPaths.ts';

type AuthTokens = Record<string, string>;

const productionApiUrl = 'https://api.instantdb.com';

type AuthConfig =
  | { type: 'map'; tokens: AuthTokens }
  | { type: 'legacy'; token: string }
  | { type: 'invalid' };

type AuthPaths = ReturnType<typeof getAuthPaths>;

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '');
}

function parseAuthConfig(contents: string): AuthConfig {
  if (!contents) return { type: 'invalid' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    const trimmed = contents.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return { type: 'invalid' };
    }
    return { type: 'legacy', token: trimmed };
  }

  if (
    parsed === null ||
    Array.isArray(parsed) ||
    typeof parsed !== 'object' ||
    !Object.values(parsed).every((token) => typeof token === 'string')
  ) {
    return { type: 'invalid' };
  }

  const tokens: AuthTokens = {};
  for (const [apiUrl, token] of Object.entries(parsed)) {
    tokens[normalizeApiUrl(apiUrl)] = token as string;
  }
  return { type: 'map', tokens };
}

function serializeAuthTokens(tokens: AuthTokens): string {
  return JSON.stringify(tokens, null, 2) + '\n';
}

async function readAuthConfigFile(paths: AuthPaths): Promise<string | null> {
  try {
    return await readFile(paths.authConfigFilePath, 'utf8');
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function writeAuthConfigFile(paths: AuthPaths, tokens: AuthTokens) {
  await mkdir(paths.appConfigDirPath, { recursive: true });
  await writeFile(
    paths.authConfigFilePath,
    serializeAuthTokens(tokens),
    'utf8',
  );
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function tokenBelongsToApiUrl(apiUrl: string, authToken: string) {
  try {
    const response = await fetch(`${apiUrl}/dash/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getLegacyTokenApiUrl(apiUrl: string, authToken: string) {
  if (await tokenBelongsToApiUrl(apiUrl, authToken)) return apiUrl;
  if (
    apiUrl !== productionApiUrl &&
    (await tokenBelongsToApiUrl(productionApiUrl, authToken))
  ) {
    return productionApiUrl;
  }
  return null;
}

export async function readConfigAuthToken(
  apiUrl: string,
): Promise<string | null> {
  const paths = getAuthPaths();
  const contents = await readAuthConfigFile(paths);
  if (contents === null) return null;

  const config = parseAuthConfig(contents);
  const key = normalizeApiUrl(apiUrl);
  if (config.type === 'map') return config.tokens[key] || null;
  if (config.type === 'invalid') return null;

  const migrationKey = await getLegacyTokenApiUrl(key, config.token);

  if (migrationKey) {
    await writeAuthConfigFile(paths, {
      [migrationKey]: config.token,
    }).catch(() => {});
  }

  // If production accepted the token while another backend is selected, do
  // not send a known production credential to that backend.
  return migrationKey && migrationKey !== key ? null : config.token;
}

export async function saveConfigAuthToken(
  apiUrl: string,
  authToken: string,
): Promise<void> {
  const paths = getAuthPaths();
  const contents = await readAuthConfigFile(paths);
  const config = contents === null ? null : parseAuthConfig(contents);
  const key = normalizeApiUrl(apiUrl);
  let tokens: AuthTokens = {};
  if (config?.type === 'map') {
    tokens = config.tokens;
  } else if (config?.type === 'legacy') {
    const legacyKey = await getLegacyTokenApiUrl(key, config.token);
    if (legacyKey && legacyKey !== key) {
      tokens[legacyKey] = config.token;
    }
  }
  tokens[key] = authToken;
  await writeAuthConfigFile(paths, tokens);
}

export async function removeConfigAuthToken(
  apiUrl: string,
): Promise<'removed' | 'not-found'> {
  const paths = getAuthPaths();
  const contents = await readAuthConfigFile(paths);
  if (contents === null) return 'not-found';

  const config = parseAuthConfig(contents);
  if (config.type === 'legacy') {
    const key = normalizeApiUrl(apiUrl);
    if (key === productionApiUrl) {
      await rm(paths.authConfigFilePath);
      return 'removed';
    }

    const legacyKey = await getLegacyTokenApiUrl(key, config.token);
    if (legacyKey === key) {
      await rm(paths.authConfigFilePath);
      return 'removed';
    }
    if (legacyKey) {
      await writeAuthConfigFile(paths, { [legacyKey]: config.token });
    }
    return 'not-found';
  }
  if (config.type === 'invalid') return 'not-found';

  const key = normalizeApiUrl(apiUrl);
  if (!(key in config.tokens)) return 'not-found';

  delete config.tokens[key];
  if (Object.keys(config.tokens).length === 0) {
    await rm(paths.authConfigFilePath);
  } else {
    await writeAuthConfigFile(paths, config.tokens);
  }
  return 'removed';
}

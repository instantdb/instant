import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { getAuthPaths } from './util/getAuthPaths.ts';

export type AuthTokens = Record<string, string>;

const productionApiUrl = 'https://api.instantdb.com';

type AuthConfig =
  | { type: 'map'; tokens: AuthTokens }
  | { type: 'legacy'; token: string }
  | { type: 'invalid' };

export type AuthPaths = ReturnType<typeof getAuthPaths>;

export function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '');
}

function parseAuthConfig(contents: string): AuthConfig {
  if (!contents) return { type: 'invalid' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    const trimmed = contents.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return { type: 'invalid' };
    }
    return { type: 'legacy', token: contents };
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

export async function readConfigAuthToken(
  apiUrl: string,
  paths: AuthPaths = getAuthPaths(),
): Promise<string | null> {
  const contents = await readAuthConfigFile(paths);
  if (contents === null) return null;

  const config = parseAuthConfig(contents);
  const key = normalizeApiUrl(apiUrl);
  if (config.type === 'map') return config.tokens[key] || null;
  if (config.type === 'invalid') return null;

  // Verify a legacy token before associating it with a backend. Legacy tokens
  // usually came from production, so check there if a custom backend rejects
  // it, but never make the duplicate request when production is current.
  let migrationKey: string | null = null;
  if (await tokenBelongsToApiUrl(key, config.token)) {
    migrationKey = key;
  } else if (
    key !== productionApiUrl &&
    (await tokenBelongsToApiUrl(productionApiUrl, config.token))
  ) {
    migrationKey = productionApiUrl;
  }

  // Validation and migration remain best-effort so existing commands can
  // still attempt authentication with the legacy token.
  if (migrationKey) {
    await writeAuthConfigFile(paths, {
      [migrationKey]: config.token,
    }).catch(() => {});
  }
  return config.token;
}

export async function saveConfigAuthToken(
  apiUrl: string,
  authToken: string,
  paths: AuthPaths = getAuthPaths(),
): Promise<void> {
  const contents = await readAuthConfigFile(paths);
  const config = contents === null ? null : parseAuthConfig(contents);
  const tokens = config?.type === 'map' ? config.tokens : {};
  tokens[normalizeApiUrl(apiUrl)] = authToken;
  await writeAuthConfigFile(paths, tokens);
}

export async function removeConfigAuthToken(
  apiUrl: string,
  paths: AuthPaths = getAuthPaths(),
): Promise<'removed' | 'not-found'> {
  const contents = await readAuthConfigFile(paths);
  if (contents === null) return 'not-found';

  const config = parseAuthConfig(contents);
  if (config.type === 'legacy') {
    await rm(paths.authConfigFilePath);
    return 'removed';
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

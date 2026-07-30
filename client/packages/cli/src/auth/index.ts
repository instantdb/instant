import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import envPaths from 'env-paths';

const CLOUD_API_URI = 'https://api.instantdb.com';
const LOCAL_API_URI = 'http://localhost:8888';

function normalizeApiURI(apiURI: string) {
  const url = new URL(apiURI);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Instant API URI must use http:// or https://');
  }

  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');

  return url.toString().replace(/\/$/, '');
}

function getAuthConfigFilePath(apiURI: string) {
  const normalizedApiURI = normalizeApiURI(apiURI);
  const backendKey = createHash('sha256')
    .update(normalizedApiURI)
    .digest('hex');
  const { config: configDir } = envPaths('instantdb-prod');

  return join(configDir, 'auth', backendKey);
}

function getLegacyAuthConfigFilePath(apiURI: string) {
  const normalizedApiURI = normalizeApiURI(apiURI);
  const legacyConfigName =
    normalizedApiURI === CLOUD_API_URI
      ? 'instantdb-prod'
      : normalizedApiURI === LOCAL_API_URI
        ? 'instantdb-dev'
        : null;

  if (!legacyConfigName) {
    return null;
  }

  return join(envPaths(legacyConfigName).config, 'a');
}

async function readFileOrNull(filePath: string) {
  try {
    return (await readFile(filePath, 'utf8')).trim();
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function readAuthToken(apiURI: string) {
  const authConfigFilePath = getAuthConfigFilePath(apiURI);
  const authToken = await readFileOrNull(authConfigFilePath);
  if (authToken) {
    return authToken;
  }

  const legacyPath = getLegacyAuthConfigFilePath(apiURI);
  if (!legacyPath) {
    return null;
  }

  const legacyAuthToken = await readFileOrNull(legacyPath);
  if (!legacyAuthToken) {
    return null;
  }

  await writeAuthTokenFile(authConfigFilePath, legacyAuthToken).catch(
    () => undefined,
  );
  return legacyAuthToken;
}

export async function writeAuthToken(apiURI: string, authToken: string) {
  const authConfigFilePath = getAuthConfigFilePath(apiURI);
  await writeAuthTokenFile(authConfigFilePath, authToken);

  const legacyPath = getLegacyAuthConfigFilePath(apiURI);
  if (legacyPath) {
    await writeAuthTokenFile(legacyPath, authToken).catch(() => undefined);
  }
}

async function writeAuthTokenFile(filePath: string, authToken: string) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, authToken, { encoding: 'utf8', mode: 0o600 });
}

export async function removeAuthToken(apiURI: string) {
  const authConfigFilePath = getAuthConfigFilePath(apiURI);
  const legacyPath = getLegacyAuthConfigFilePath(apiURI);
  const paths = legacyPath
    ? [authConfigFilePath, legacyPath]
    : [authConfigFilePath];
  const removed = await Promise.all(paths.map(removeFileIfExists));
  return removed.some(Boolean);
}

async function removeFileIfExists(filePath: string) {
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const paths = vi.hoisted(() => ({ root: '' }));

vi.mock('env-paths', () => ({
  default: (name: string) => ({ config: `${paths.root}/${name}` }),
}));

import {
  readAuthToken,
  removeAuthToken,
  writeAuthToken,
} from '../src/auth/index.ts';

beforeEach(async () => {
  paths.root = await mkdtemp(join(tmpdir(), 'instant-cli-auth-'));
});

afterEach(async () => {
  await rm(paths.root, { recursive: true, force: true });
});

const writeLegacyAuthToken = async (
  configName: 'instantdb-prod' | 'instantdb-dev',
  authToken: string,
) => {
  const configDir = join(paths.root, configName);
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, 'a'), authToken);
};

describe('backend-scoped auth tokens', () => {
  it('treats equivalent backend URLs as the same credential scope', async () => {
    await writeAuthToken(
      'https://EXAMPLE.com:443/backend/?ignored=true',
      'auth-token',
    );

    expect(await readAuthToken('https://example.com/backend')).toBe(
      'auth-token',
    );
  });

  it('rejects non-HTTP URLs', async () => {
    await expect(readAuthToken('ftp://example.com')).rejects.toThrow(
      'Instant API URI must use http:// or https://',
    );
  });

  it('stores and removes credentials independently by backend', async () => {
    const cloudApiURI = 'https://api.instantdb.com';
    const selfHostedApiURI = 'https://instant.example.com';

    await writeAuthToken(cloudApiURI, 'cloud-token');
    await writeAuthToken(selfHostedApiURI, 'self-hosted-token');

    expect(await readAuthToken(cloudApiURI)).toBe('cloud-token');
    expect(await readAuthToken(selfHostedApiURI)).toBe('self-hosted-token');

    expect(await removeAuthToken(selfHostedApiURI)).toBe(true);
    expect(await readAuthToken(selfHostedApiURI)).toBeNull();
    expect(await readAuthToken(cloudApiURI)).toBe('cloud-token');
  });

  it('does not read or overwrite a legacy Cloud token for a custom backend', async () => {
    await writeLegacyAuthToken('instantdb-prod', 'cloud-token');

    const selfHostedApiURI = 'https://instant.example.com';
    expect(await readAuthToken(selfHostedApiURI)).toBeNull();

    await writeAuthToken(selfHostedApiURI, 'self-hosted-token');
    expect(
      await readFile(join(paths.root, 'instantdb-prod', 'a'), 'utf8'),
    ).toBe('cloud-token');
  });

  it('copies the legacy Cloud token into scoped storage', async () => {
    const apiURI = 'https://api.instantdb.com';
    const legacyPath = join(paths.root, 'instantdb-prod', 'a');
    await writeLegacyAuthToken('instantdb-prod', 'cloud-token');

    expect(await readAuthToken(apiURI)).toBe('cloud-token');
    await unlink(legacyPath);
    expect(await readAuthToken(apiURI)).toBe('cloud-token');
  });

  it('copies the legacy localhost token into scoped storage', async () => {
    const apiURI = 'http://localhost:8888';
    const legacyPath = join(paths.root, 'instantdb-dev', 'a');
    await writeLegacyAuthToken('instantdb-dev', 'local-token');

    expect(await readAuthToken(apiURI)).toBe('local-token');
    await unlink(legacyPath);
    expect(await readAuthToken(apiURI)).toBe('local-token');
  });

  it('keeps legacy clients logged in for known backends', async () => {
    await writeAuthToken('https://api.instantdb.com', 'cloud-token');
    await writeAuthToken('http://localhost:8888', 'local-token');

    expect(
      await readFile(join(paths.root, 'instantdb-prod', 'a'), 'utf8'),
    ).toBe('cloud-token');
    expect(await readFile(join(paths.root, 'instantdb-dev', 'a'), 'utf8')).toBe(
      'local-token',
    );
  });

  it('logs out legacy and scoped credentials for the current backend', async () => {
    const apiURI = 'https://api.instantdb.com';
    await writeLegacyAuthToken('instantdb-prod', 'legacy-token');
    await writeAuthToken(apiURI, 'scoped-token');

    expect(await removeAuthToken(apiURI)).toBe(true);
    expect(await readAuthToken(apiURI)).toBeNull();
    expect(await removeAuthToken(apiURI)).toBe(false);
  });
});

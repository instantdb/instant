import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type AuthPaths,
  normalizeApiUrl,
  readConfigAuthToken,
  removeConfigAuthToken,
  saveConfigAuthToken,
} from '../src/auth.ts';

describe('auth config', () => {
  let tempDir: string;
  let paths: AuthPaths;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'instant-cli-auth-'));
    paths = {
      appConfigDirPath: tempDir,
      authConfigFilePath: join(tempDir, 'a'),
    };
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reads and migrates a legacy raw token', async () => {
    await writeFile(paths.authConfigFilePath, 'legacy-token');

    await expect(
      readConfigAuthToken('https://api.instantdb.com/', paths),
    ).resolves.toBe('legacy-token');
    await expect(readStoredTokens(paths)).resolves.toEqual({
      'https://api.instantdb.com': 'legacy-token',
    });
  });

  it('uses a legacy token even when migration cannot be written', async () => {
    await writeFile(paths.authConfigFilePath, 'legacy-token');
    const unwritablePaths = {
      ...paths,
      appConfigDirPath: paths.authConfigFilePath,
    };

    await expect(
      readConfigAuthToken('https://api.instantdb.com', unwritablePaths),
    ).resolves.toBe('legacy-token');
    await expect(readFile(paths.authConfigFilePath, 'utf8')).resolves.toBe(
      'legacy-token',
    );
  });

  it('selects only the token for the current API URL', async () => {
    await writeFile(
      paths.authConfigFilePath,
      JSON.stringify({
        'https://api.instantdb.com': 'production-token',
        'https://staging.example.com': 'staging-token',
      }),
    );

    await expect(
      readConfigAuthToken('https://staging.example.com/', paths),
    ).resolves.toBe('staging-token');
    await expect(
      readConfigAuthToken('https://missing.example.com', paths),
    ).resolves.toBeNull();
  });

  it('does not treat malformed JSON maps as auth tokens', async () => {
    await writeFile(paths.authConfigFilePath, '{"https://api.example.com":');

    await expect(
      readConfigAuthToken('https://api.example.com', paths),
    ).resolves.toBeNull();
  });

  it('does not treat invalid JSON values as auth tokens', async () => {
    await writeFile(
      paths.authConfigFilePath,
      JSON.stringify({ 'https://api.example.com': 123 }),
    );

    await expect(
      readConfigAuthToken('https://api.example.com', paths),
    ).resolves.toBeNull();
  });

  it('preserves tokens for other API URLs when saving', async () => {
    await saveConfigAuthToken(
      'https://api.instantdb.com',
      'production-token',
      paths,
    );
    await saveConfigAuthToken(
      'https://staging.example.com/',
      'staging-token',
      paths,
    );

    await expect(readStoredTokens(paths)).resolves.toEqual({
      'https://api.instantdb.com': 'production-token',
      'https://staging.example.com': 'staging-token',
    });
  });

  it('removes only the current API URL token', async () => {
    await writeFile(
      paths.authConfigFilePath,
      JSON.stringify({
        'https://api.instantdb.com': 'production-token',
        'https://staging.example.com': 'staging-token',
      }),
    );

    await expect(
      removeConfigAuthToken('https://staging.example.com/', paths),
    ).resolves.toBe('removed');
    await expect(readStoredTokens(paths)).resolves.toEqual({
      'https://api.instantdb.com': 'production-token',
    });
  });

  it('deletes the config file after removing the final token', async () => {
    await saveConfigAuthToken('https://api.instantdb.com', 'token', paths);

    await expect(
      removeConfigAuthToken('https://api.instantdb.com', paths),
    ).resolves.toBe('removed');
    await expect(readFile(paths.authConfigFilePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('removes a legacy raw token when logging out', async () => {
    await writeFile(paths.authConfigFilePath, 'legacy-token');

    await expect(
      removeConfigAuthToken('https://api.instantdb.com', paths),
    ).resolves.toBe('removed');
    await expect(readFile(paths.authConfigFilePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('normalizes trailing slashes', () => {
    expect(normalizeApiUrl('https://api.example.com///')).toBe(
      'https://api.example.com',
    );
  });
});

async function readStoredTokens(paths: AuthPaths) {
  return JSON.parse(await readFile(paths.authConfigFilePath, 'utf8'));
}

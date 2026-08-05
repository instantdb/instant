import { test, expect, describe, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Effect, Layer, Logger } from 'effect';
import { GlobalOpts } from '../src/context/globalOpts.ts';
import { AuthToken } from '../src/context/authToken.ts';
import { CurrentApp } from '../src/context/currentApp.ts';

vi.mock('../src/index.ts', () => ({}));

const state = vi.hoisted(() => ({
  manager: undefined as any,
  downloadResult: undefined as any,
  downloadError: undefined as Error | undefined,
  downloadCalls: [] as any[],
  promptResponses: [] as unknown[],
}));

// Mock at the SDK boundary: any `new InstantPlatformApi(...)` returns a stub
// whose `.backups(appId)` is the per-test fake manager.
vi.mock('@instantdb/platform', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    PlatformApi: class {
      backups(_appId: string) {
        return state.manager;
      }
    },
  };
});

// The download pipeline is network- and disk-heavy; the command tests only
// care that it's invoked with the right backup and destination.
vi.mock('../src/lib/backupDownload.ts', () => ({
  downloadBackupToFile: vi.fn(async (opts: any) => {
    state.downloadCalls.push(opts);
    if (state.downloadError) throw state.downloadError;
    return state.downloadResult;
  }),
}));

vi.mock('../src/ui/lib.ts', async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    renderUnwrap: () => {
      if (state.promptResponses.length === 0) {
        return Promise.reject(new Error('No prompt response queued'));
      }
      return Promise.resolve(state.promptResponses.shift());
    },
  };
});

const { backupListCmd } = await import('../src/commands/backup/list.ts');
const { backupDownloadCmd } = await import(
  '../src/commands/backup/download.ts'
);

let logs: string[] = [];

const makeBackup = (overrides: any = {}) => ({
  id: 'backup-1',
  isn: '1',
  backupAt: new Date('2026-08-01T00:00:00Z'),
  filesSize: 1000,
  dbSize: 2000,
  uncompressedSize: 3000,
  description: 'Automated Daily Snapshot',
  expiresAt: new Date('2026-08-08T00:00:00Z'),
  ...overrides,
});

const buildManager = (backups: any[]) => ({
  list: vi.fn(async () => backups),
});

const outPath = () => join(tmpdir(), `backup-test-${Date.now()}.zip`);

const run = (effect: any, opts: { yes: boolean }) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(GlobalOpts, { yes: opts.yes }),
          Layer.succeed(AuthToken, {
            getAuthToken: Effect.succeed('test-token'),
            getSource: Effect.succeed('env' as const),
            setAuthToken: () => Effect.succeed(undefined),
          }),
          Layer.succeed(CurrentApp, {
            appId: 'test-app',
            source: 'env' as const,
          }),
          Logger.replace(
            Logger.defaultLogger,
            Logger.make(({ message }) => {
              logs.push(String(message));
            }),
          ),
        ),
      ),
    ),
  );

beforeEach(() => {
  logs = [];
  state.manager = buildManager([]);
  state.downloadResult = { entities: 3, files: 2, zipBytes: 1234 };
  state.downloadError = undefined;
  state.downloadCalls = [];
  state.promptResponses = [];
});

describe('backup list', () => {
  test('renders backups as a table', async () => {
    state.manager = buildManager([makeBackup()]);
    await run(backupListCmd({}), { yes: true });
    const output = logs.join('\n');
    expect(output).toContain('BACKUP (UTC)');
    expect(output).toContain('2026-08-01 00:00');
    expect(output).toContain('backup-1');
    expect(output).toContain('Automated Daily Snapshot');
  });

  test('outputs JSON with --json', async () => {
    state.manager = buildManager([makeBackup()]);
    await run(backupListCmd({ json: true }), { yes: true });
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('backup-1');
  });

  test('handles no backups', async () => {
    await run(backupListCmd({}), { yes: true });
    expect(logs.join('\n')).toContain('No backups yet.');
  });
});

describe('backup download', () => {
  test('downloads by id', async () => {
    const backup = makeBackup();
    state.manager = buildManager([backup]);
    const out = outPath();
    await run(backupDownloadCmd('backup-1', { out }), { yes: true });
    expect(state.downloadCalls).toHaveLength(1);
    expect(state.downloadCalls[0].backup).toEqual(backup);
    expect(state.downloadCalls[0].outPath).toBe(out);
    expect(logs.join('\n')).toContain('Saved 3 namespaces and 2 storage files');
  });

  test('rejects a backup id combined with --latest', async () => {
    state.manager = buildManager([makeBackup()]);
    await expect(
      run(backupDownloadCmd('backup-1', { latest: true, out: outPath() }), {
        yes: true,
      }),
    ).rejects.toThrow(/not both/);
    expect(state.downloadCalls).toHaveLength(0);
  });

  test('rejects an output path that is a directory', async () => {
    state.manager = buildManager([makeBackup()]);
    await expect(
      run(backupDownloadCmd('backup-1', { out: tmpdir() }), { yes: true }),
    ).rejects.toThrow(/is a directory/);
    expect(state.downloadCalls).toHaveLength(0);
  });

  test('errors on an unknown id', async () => {
    state.manager = buildManager([makeBackup()]);
    await expect(
      run(backupDownloadCmd('nope', { out: outPath() }), { yes: true }),
    ).rejects.toThrow(/No backup found with id nope/);
  });

  test('--latest picks the newest backup', async () => {
    const older = makeBackup();
    const newer = makeBackup({
      id: 'backup-2',
      backupAt: new Date('2026-08-02T00:00:00Z'),
    });
    state.manager = buildManager([older, newer]);
    await run(backupDownloadCmd(undefined, { latest: true, out: outPath() }), {
      yes: true,
    });
    expect(state.downloadCalls[0].backup.id).toBe('backup-2');
  });

  test('requires an id or --latest when prompts are skipped', async () => {
    state.manager = buildManager([makeBackup()]);
    await expect(
      run(backupDownloadCmd(undefined, {}), { yes: true }),
    ).rejects.toThrow(/Must specify a backup id or --latest/);
  });

  test('prompts for a backup and confirmation interactively', async () => {
    const backup = makeBackup();
    state.manager = buildManager([backup]);
    // First the backup picker, then the download confirmation.
    state.promptResponses = [backup, true];
    await run(backupDownloadCmd(undefined, { out: outPath() }), {
      yes: false,
    });
    expect(state.downloadCalls).toHaveLength(1);
    expect(state.downloadCalls[0].backup).toEqual(backup);
  });

  test('reports a cancelled download', async () => {
    state.manager = buildManager([makeBackup()]);
    state.downloadError = Object.assign(new Error('aborted'), {
      name: 'AbortError',
    });
    await run(backupDownloadCmd('backup-1', { out: outPath() }), {
      yes: true,
    });
    expect(logs.join('\n')).toContain('Download cancelled.');
  });
});

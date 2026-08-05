import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Uint8ArrayReader, ZipReader, type Entry } from '@zip.js/zip.js';
import type {
  BackupDownloadCallbacks,
  BackupEntry,
  BackupFile,
  InstantAppBackup,
} from '@instantdb/platform';
import { Effect, Layer, Logger } from 'effect';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { GlobalOpts } from '../src/context/globalOpts.ts';

vi.mock('../src/index.ts', () => ({}));

const state = vi.hoisted(() => ({
  manager: undefined as any,
  promptResponses: [] as unknown[],
  prompts: [] as any[],
}));

vi.mock('../src/lib/backups.ts', async () => {
  const { Effect } = await import('effect');
  return {
    buildBackupsManager: () =>
      Effect.succeed({ appId: 'test-app', manager: state.manager }),
  };
});

vi.mock('../src/ui/lib.ts', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    renderUnwrap: (prompt: any) => {
      state.prompts.push(prompt);
      const promise = prompt?.props?.promise;
      if (promise instanceof Promise) return promise;
      if (state.promptResponses.length === 0) {
        return Promise.reject(new Error('No prompt response queued'));
      }
      return Promise.resolve(state.promptResponses.shift());
    },
  };
});

const { backupListCommand } = await import('../src/commands/backup/list.ts');
const { backupDownloadCommand } = await import(
  '../src/commands/backup/download.ts'
);
const { downloadBackupArchive } = await import('../src/lib/backupArchive.ts');

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const makeBackup = (
  id: string,
  overrides: Partial<InstantAppBackup> = {},
): InstantAppBackup => ({
  id,
  isn: `isn-${id}`,
  backup_at: '2026-08-04T12:00:00.000Z',
  files_size: 300,
  db_size: 900,
  uncompressed_size: 1200,
  description: null,
  expires_at: '2030-08-04T12:00:00.000Z',
  ...overrides,
});

type TestEntry = Omit<BackupEntry, 'input' | 'lastModified'> & {
  body: Uint8Array;
};

const textEntry = (
  kind: TestEntry['kind'],
  name: string,
  body: string,
): TestEntry => ({
  kind,
  name,
  sourceName: name,
  body: encoder.encode(body),
});

const readable = (body: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  });

const makeManager = ({
  backups = [],
  entries = [textEntry('config', 'config.json', '{"app":"test"}')],
  failAfter,
}: {
  backups?: InstantAppBackup[];
  entries?: TestEntry[];
  failAfter?: number;
} = {}) => {
  const list = vi.fn(async () => backups);
  const downloadEntries = vi.fn(
    (
      _appId: string,
      backup: InstantAppBackup,
      options: {
        signal?: AbortSignal;
        callbacks?: BackupDownloadCallbacks;
      } = {},
    ) =>
      (async function* () {
        const backupFiles: BackupFile[] = entries
          .filter((entry) => entry.kind !== 'storage')
          .map((entry) => ({ name: entry.name, size: entry.body.byteLength }));
        options.callbacks?.onBackupFiles?.(backupFiles);

        let completed = 0;
        for (const entry of entries) {
          options.signal?.throwIfAborted();
          if (entry.kind === 'storage') {
            options.callbacks?.onStorageFile?.({
              locationId: entry.name.slice('files/'.length),
              path: entry.sourceName,
              url: 'https://storage.test/file',
            });
          }
          yield {
            kind: entry.kind,
            name: entry.name,
            sourceName: entry.sourceName,
            lastModified: new Date(backup.backup_at),
            input: readable(entry.body),
          } satisfies BackupEntry;
          completed++;
          if (completed === failAfter) {
            throw new Error('stream failed');
          }
        }
        options.callbacks?.onStorageComplete?.();
      })(),
  );
  return { list, downloadEntries };
};

let logs: string[];
let testDirectory: string;

const run = (effect: Effect.Effect<any, any, any>, yes: boolean) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(GlobalOpts, { yes }),
          Logger.replace(
            Logger.defaultLogger,
            Logger.make(({ message }) => logs.push(String(message))),
          ),
        ),
      ),
    ) as any,
  );

const partialFiles = async () =>
  (await readdir(testDirectory)).filter((name) => name.endsWith('.partial'));

const entryBytes = async (entry: Entry) => {
  if (entry.directory)
    throw new Error(`Unexpected directory ${entry.filename}`);
  return new Uint8Array(await entry.arrayBuffer());
};

beforeEach(async () => {
  logs = [];
  state.promptResponses = [];
  state.prompts = [];
  state.manager = makeManager();
  testDirectory = await mkdtemp(join(tmpdir(), 'instant-cli-backup-test-'));
});

afterEach(async () => {
  await rm(testDirectory, { force: true, recursive: true });
});

describe('backup list', () => {
  test('prints backups in human format', async () => {
    state.manager = makeManager({
      backups: [
        makeBackup('backup-1', { description: 'Nightly\u001b[2J\nbackup' }),
      ],
    });

    await run(backupListCommand({} as any), false);

    const output = logs.join('\n');
    expect(output).toContain('ID: backup-1');
    expect(output).toContain('Data size: 1.50 KB');
    expect(output).toContain('Expires:');
    expect(output).not.toContain('\u001b[2J');
  });

  test('--json prints active backups newest first and filters expired backups', async () => {
    const old = makeBackup('old', {
      backup_at: '2026-08-01T12:00:00.000Z',
    });
    const newest = makeBackup('newest', {
      backup_at: '2026-08-03T12:00:00.000Z',
    });
    const expired = makeBackup('expired', {
      expires_at: '2020-08-05T12:00:00.000Z',
    });
    const missingExpiration = makeBackup('missing-expiration', {
      expires_at: null,
    });
    state.manager = makeManager({
      backups: [old, expired, missingExpiration, newest],
    });

    await run(backupListCommand({ json: true } as any), false);

    expect(JSON.parse(logs.join('\n')).map((backup: any) => backup.id)).toEqual(
      ['newest', 'old'],
    );
  });

  test('prints an empty state', async () => {
    await run(backupListCommand({} as any), false);
    expect(logs).toEqual(['No backups available.']);
  });
});

describe('backup download selection', () => {
  test('downloads an explicit active backup with --yes', async () => {
    const backup = makeBackup('chosen');
    state.manager = makeManager({ backups: [backup] });
    const output = join(testDirectory, 'chosen.zip');

    await run(backupDownloadCommand('chosen', { output } as any), true);

    expect(state.manager.downloadEntries).toHaveBeenCalledWith(
      'test-app',
      backup,
      expect.any(Object),
    );
    expect(await readFile(output)).not.toHaveLength(0);
    expect(logs.join('\n')).toContain('Saved 0 namespaces');
  });

  test('--latest selects the newest active backup', async () => {
    const old = makeBackup('old', {
      backup_at: '2026-08-01T12:00:00.000Z',
    });
    const newest = makeBackup('newest', {
      backup_at: '2026-08-03T12:00:00.000Z',
    });
    state.manager = makeManager({ backups: [old, newest] });

    await run(
      backupDownloadCommand(undefined, {
        latest: true,
        output: join(testDirectory, 'latest.zip'),
      } as any),
      true,
    );

    expect(state.manager.downloadEntries.mock.calls[0][1]).toBe(newest);
  });

  test('rejects a backup ID combined with --latest', async () => {
    state.manager = makeManager({ backups: [makeBackup('backup-1')] });

    await expect(
      run(
        backupDownloadCommand('backup-1', {
          latest: true,
          output: join(testDirectory, 'conflict.zip'),
        } as any),
        true,
      ),
    ).rejects.toMatchObject({
      message: 'Specify a backup ID or --latest, not both.',
    });
    expect(state.manager.downloadEntries).not.toHaveBeenCalled();
  });

  test('rejects --yes without a backup ID or --latest', async () => {
    state.manager = makeManager({ backups: [makeBackup('backup-1')] });

    await expect(
      run(
        backupDownloadCommand(undefined, {
          output: join(testDirectory, 'missing-selection.zip'),
        } as any),
        true,
      ),
    ).rejects.toMatchObject({
      message: 'Specify a backup ID or --latest when using --yes.',
    });
    expect(state.manager.downloadEntries).not.toHaveBeenCalled();
  });

  test('uses the interactive picker when no backup is specified', async () => {
    const first = makeBackup('first', {
      backup_at: '2026-08-03T12:00:00.000Z',
    });
    const second = makeBackup('second', {
      backup_at: '2026-08-02T12:00:00.000Z',
    });
    state.manager = makeManager({ backups: [second, first] });
    state.promptResponses.push(second);

    await run(
      backupDownloadCommand(undefined, {
        output: join(testDirectory, 'picked.zip'),
      } as any),
      false,
    );

    expect(state.prompts[0].constructor.name).toBe('Select');
    const picker = state.prompts[0].render('idle');
    expect(picker.indexOf('first')).toBeLessThan(picker.indexOf('second'));
    expect(state.manager.downloadEntries.mock.calls[0][1]).toBe(second);
  });

  test('leaves an existing output untouched when replacement is cancelled', async () => {
    const backup = makeBackup('backup-1');
    state.manager = makeManager({ backups: [backup] });
    const output = join(testDirectory, 'existing.zip');
    await writeFile(output, 'keep me');
    state.promptResponses.push(false);

    await run(backupDownloadCommand('backup-1', { output } as any), false);

    expect(state.prompts[0].constructor.name).toBe('Confirmation');
    expect(state.prompts[0].render('idle')).toContain('File already exists');
    expect(await readFile(output, 'utf8')).toBe('keep me');
    expect(state.manager.downloadEntries).not.toHaveBeenCalled();
    expect(logs).toEqual(['Cancelled.']);
  });
});

describe('backup ZIP archive', () => {
  test('writes restore-ready entries in exact order without changing bytes', async () => {
    const binary = Uint8Array.from([0, 1, 2, 127, 128, 255]);
    const entries: TestEntry[] = [
      textEntry('config', 'config.json', '{"app":{"id":"app-1"}}'),
      textEntry('entity', 'entities/$files.jsonl', '{"id":"file-1"}\n'),
      textEntry('entity', 'entities/posts.jsonl', '{"title":"Hello"}\n'),
      {
        kind: 'storage',
        name: 'files/location-1',
        sourceName: 'images/photo.bin',
        body: binary,
      },
    ];
    const manager = makeManager({ entries });
    const output = join(testDirectory, 'archive.zip');

    const result = await downloadBackupArchive({
      appId: 'app-1',
      backup: makeBackup('backup-1'),
      manager: manager as any,
      outputPath: output,
    });

    const archive = await readFile(output);
    const reader = new ZipReader(new Uint8ArrayReader(archive));
    const zipEntries = await reader.getEntries();
    expect(zipEntries.map((entry) => entry.filename)).toEqual([
      'config.json',
      'entities/$files.jsonl',
      'entities/posts.jsonl',
      'files/location-1',
    ]);
    expect(decoder.decode(await entryBytes(zipEntries[0]!))).toBe(
      '{"app":{"id":"app-1"}}',
    );
    expect(decoder.decode(await entryBytes(zipEntries[1]!))).toBe(
      '{"id":"file-1"}\n',
    );
    expect(decoder.decode(await entryBytes(zipEntries[2]!))).toBe(
      '{"title":"Hello"}\n',
    );
    expect(await entryBytes(zipEntries[3]!)).toEqual(binary);
    await reader.close();

    expect(result).toMatchObject({ entities: 2, storageFiles: 1 });
    expect(result.bytesWritten).toBe(archive.byteLength);
    expect(await partialFiles()).toEqual([]);
  });

  test('replaces an existing archive only after the download succeeds', async () => {
    const output = join(testDirectory, 'replace.zip');
    await writeFile(output, 'old archive');

    await downloadBackupArchive({
      appId: 'app-1',
      backup: makeBackup('backup-1'),
      manager: makeManager() as any,
      outputPath: output,
    });

    expect(await readFile(output, 'utf8')).not.toBe('old archive');
    expect(await partialFiles()).toEqual([]);
  });

  test('removes its partial file and preserves an existing output on failure', async () => {
    const output = join(testDirectory, 'failed.zip');
    await writeFile(output, 'original archive');
    const manager = makeManager({
      entries: [
        textEntry('config', 'config.json', '{}'),
        textEntry('entity', 'entities/posts.jsonl', '{}\n'),
      ],
      failAfter: 1,
    });

    await expect(
      downloadBackupArchive({
        appId: 'app-1',
        backup: makeBackup('backup-1'),
        manager: manager as any,
        outputPath: output,
      }),
    ).rejects.toThrow('stream failed');

    expect(await readFile(output, 'utf8')).toBe('original archive');
    expect(await partialFiles()).toEqual([]);
  });

  test('removes its partial file when an in-progress download is aborted', async () => {
    const output = join(testDirectory, 'aborted.zip');
    const controller = new AbortController();
    const manager = makeManager({
      entries: [textEntry('config', 'config.json', '{}')],
    });

    await expect(
      downloadBackupArchive({
        appId: 'app-1',
        backup: makeBackup('backup-1'),
        manager: manager as any,
        outputPath: output,
        signal: controller.signal,
        onProgress(progress) {
          if (progress.currentEntry === 'config.json') controller.abort();
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await partialFiles()).toEqual([]);
  });
});

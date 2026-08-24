import { describe, expect, test } from 'vitest';
import { downloadBackupArchive } from '../../src/backupDownload.ts';
import type { AppBackup } from '../../src/backups.ts';

const backup: AppBackup = {
  id: 'backup-1',
  isn: '1',
  backupAt: new Date('2026-08-01T00:00:00Z'),
  filesSize: 16,
  dbSize: 100,
  uncompressedSize: 40,
  description: null,
  expiresAt: null,
};

const bodyOf = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

const fetchBody = async (url: string) => bodyOf(`body:${url}`);

const listFiles = async () => [
  { name: 'config.json', size: 1 },
  { name: 'entities/todos.jsonl', size: 1 },
];
const getFileUrl = async (_backupId: string, name: string) => name;

// Minimal archive writer: records entry names, drains each input, and writes
// a byte through the counting sink so zipBytes moves like a real encoder.
const makeWriter =
  (names: string[]) => async (sink: WritableStream<Uint8Array>) => {
    const w = sink.getWriter();
    return {
      add: async (name: string, input: ReadableStream<Uint8Array>) => {
        names.push(name);
        for await (const _chunk of input) {
          // drain
        }
        await w.write(new Uint8Array([0]));
      },
      close: () => w.close(),
    };
  };

const nullSink = () => new WritableStream<Uint8Array>({ write() {} });

describe('downloadBackupArchive', () => {
  test('writes entries in canonical order through the injected writer', async () => {
    const names: string[] = [];
    const manager = {
      listFiles,
      getFileUrl,
      streamStorageFiles: async function* () {
        yield { locationId: 'loc-1', path: 'a.png', url: 'loc-1-url' };
      },
    } as any;

    const result = await downloadBackupArchive({
      manager,
      backup,
      fetchBody,
      sink: nullSink(),
      createWriter: makeWriter(names),
    });

    expect(names).toEqual([
      'config.json',
      'entities/todos.jsonl',
      'files/loc-1',
    ]);
    expect(result.entities).toBe(1);
    expect(result.files).toBe(1);
    expect(result.zipBytes).toBe(3);
  });

  test('counts an entry as completed only after the writer consumed it', async () => {
    const seen: Array<{
      name: string;
      entitiesCompleted: number;
      filesCompleted: number;
    }> = [];
    let last = { entitiesCompleted: 0, filesCompleted: 0 };
    const createWriter = async (sink: WritableStream<Uint8Array>) => {
      const w = sink.getWriter();
      return {
        add: async (name: string, input: ReadableStream<Uint8Array>) => {
          seen.push({ name, ...last });
          for await (const _chunk of input) {
            // drain
          }
          await w.write(new Uint8Array([0]));
        },
        close: () => w.close(),
      };
    };
    const manager = {
      listFiles,
      getFileUrl,
      streamStorageFiles: async function* () {
        yield { locationId: 'loc-1', path: 'a.png', url: 'loc-1-url' };
      },
    } as any;

    await downloadBackupArchive({
      manager,
      backup,
      fetchBody,
      sink: nullSink(),
      createWriter,
      onProgress: (p) => {
        last = {
          entitiesCompleted: p.entitiesCompleted,
          filesCompleted: p.filesCompleted,
        };
      },
    });

    // At the moment each add starts, the entry being written isn't counted.
    expect(seen).toEqual([
      { name: 'config.json', entitiesCompleted: 0, filesCompleted: 0 },
      { name: 'entities/todos.jsonl', entitiesCompleted: 0, filesCompleted: 0 },
      { name: 'files/loc-1', entitiesCompleted: 1, filesCompleted: 0 },
    ]);
  });

  test('a cancellation while storage discovery is idle rejects instead of completing', async () => {
    const controller = new AbortController();
    const manager = {
      listFiles,
      getFileUrl,
      // Yields one file, then holds the stream open like a server with more
      // to send, rejecting with AbortError when the download is cancelled —
      // the same shape as a real aborted fetch.
      streamStorageFiles: (
        _backupId: string,
        opts?: { signal?: AbortSignal },
      ) =>
        (async function* () {
          yield { locationId: 'loc-1', path: 'a.png', url: 'loc-1-url' };
          yield await new Promise<never>((_resolve, reject) => {
            opts?.signal?.addEventListener('abort', () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              ),
            );
          });
        })(),
    } as any;

    const promise = downloadBackupArchive({
      manager,
      backup,
      fetchBody,
      sink: nullSink(),
      createWriter: makeWriter([]),
      signal: controller.signal,
      onProgress: (p) => {
        // Cancel once the only discovered file is fully written and the
        // drain loop is about to go idle.
        if (p.filesCompleted === 1) controller.abort();
      },
    });

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('fetches each entry body only when the writer reaches it, never ahead', async () => {
    const files = [
      { name: 'config.json', size: 1 },
      { name: 'entities/a.jsonl', size: 1 },
      { name: 'entities/b.jsonl', size: 1 },
    ];
    const started: string[] = [];

    const manager = {
      listFiles: async () => files,
      getFileUrl,
      streamStorageFiles: async function* () {},
    } as any;
    // Records the moment a body is fetched. Downloads are strictly sequential,
    // so this fires only when the writer reaches the entry — never ahead.
    const trackingFetch = async (url: string) => {
      started.push(url);
      return bodyOf(`body:${url}`);
    };

    // Snapshot which bodies have been fetched at the instant each write begins.
    // A body downloaded ahead of the encoder — the browser-fetch bug that
    // buffered whole entities before their turn — would show up here early.
    const startedWhenAddBegan: string[][] = [];
    const createWriter = async (sink: WritableStream<Uint8Array>) => {
      const w = sink.getWriter();
      return {
        add: async (_name: string, input: ReadableStream<Uint8Array>) => {
          startedWhenAddBegan.push([...started]);
          for await (const _chunk of input) {
            // drain
          }
          await w.write(new Uint8Array([0]));
        },
        close: () => w.close(),
      };
    };

    await downloadBackupArchive({
      manager,
      backup,
      fetchBody: trackingFetch,
      sink: nullSink(),
      createWriter,
    });

    // When each write begins, only the entry being written has been fetched —
    // nothing is pulled ahead.
    expect(startedWhenAddBegan).toEqual([
      ['config.json'],
      ['config.json', 'entities/a.jsonl'],
      ['config.json', 'entities/a.jsonl', 'entities/b.jsonl'],
    ]);
    expect(started).toEqual([
      'config.json',
      'entities/a.jsonl',
      'entities/b.jsonl',
    ]);
  });

  test('retries a transient failure opening an entry body', async () => {
    const names: string[] = [];
    const manager = {
      listFiles,
      getFileUrl,
      streamStorageFiles: async function* () {
        yield { locationId: 'loc-1', path: 'a.png', url: 'loc-1-url' };
      },
    } as any;

    // The storage blob's first open fails once, then succeeds.
    let storageAttempts = 0;
    const flakyFetch = async (url: string) => {
      if (url === 'loc-1-url') {
        storageAttempts++;
        if (storageAttempts === 1) throw new Error('ECONNRESET');
      }
      return bodyOf(`body:${url}`);
    };

    const result = await downloadBackupArchive({
      manager,
      backup,
      fetchBody: flakyFetch,
      sink: nullSink(),
      createWriter: makeWriter(names),
      retry: { attempts: 3, delayMs: 0 },
    });

    expect(storageAttempts).toBe(2);
    expect(names).toEqual([
      'config.json',
      'entities/todos.jsonl',
      'files/loc-1',
    ]);
    expect(result.files).toBe(1);
  });

  test('retries a body that connects but errors on its first read', async () => {
    const names: string[] = [];
    const manager = {
      listFiles,
      getFileUrl,
      streamStorageFiles: async function* () {
        yield { locationId: 'loc-1', path: 'a.png', url: 'loc-1-url' };
      },
    } as any;

    // fetchBody resolves (connection established) but the body errors on its
    // first read the first time — the shape of a reset idle connection.
    let storageAttempts = 0;
    const flakyFetch = async (url: string) => {
      if (url === 'loc-1-url') {
        storageAttempts++;
        if (storageAttempts === 1) {
          return new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.error(new Error('ECONNRESET'));
            },
          });
        }
      }
      return bodyOf(`body:${url}`);
    };

    const result = await downloadBackupArchive({
      manager,
      backup,
      fetchBody: flakyFetch,
      sink: nullSink(),
      createWriter: makeWriter(names),
      retry: { attempts: 3, delayMs: 0 },
    });

    expect(storageAttempts).toBe(2);
    expect(names).toEqual([
      'config.json',
      'entities/todos.jsonl',
      'files/loc-1',
    ]);
    expect(result.files).toBe(1);
  });

  test('does not retry once the body has yielded a chunk', async () => {
    const manager = {
      listFiles,
      getFileUrl,
      streamStorageFiles: async function* () {
        yield { locationId: 'loc-1', path: 'a.png', url: 'loc-1-url' };
      },
    } as any;

    // The body delivers one chunk on the first read, then errors on the next —
    // a mid-stream failure. Once bytes are flowing the entry can't be
    // restarted, so this must not retry.
    let storageAttempts = 0;
    const fetchBody = async (url: string) => {
      if (url === 'loc-1-url') {
        storageAttempts++;
        let phase = 0;
        return new ReadableStream<Uint8Array>({
          pull(controller) {
            if (phase++ === 0) {
              controller.enqueue(new TextEncoder().encode('partial'));
            } else {
              controller.error(new Error('mid-stream reset'));
            }
          },
        });
      }
      return bodyOf(`body:${url}`);
    };

    await expect(
      downloadBackupArchive({
        manager,
        backup,
        fetchBody,
        sink: nullSink(),
        createWriter: makeWriter([]),
        retry: { attempts: 3, delayMs: 0 },
      }),
    ).rejects.toThrow();
    expect(storageAttempts).toBe(1);
  });

  test('gives up after exhausting retries and names the failing entry', async () => {
    const manager = {
      listFiles,
      getFileUrl,
      streamStorageFiles: async function* () {
        yield { locationId: 'loc-9', path: null, url: 'bad-url' };
      },
    } as any;

    let attempts = 0;
    await expect(
      downloadBackupArchive({
        manager,
        backup,
        fetchBody: async (url: string) => {
          if (url === 'bad-url') {
            attempts++;
            throw new Error('HTTP 500');
          }
          return bodyOf('x');
        },
        sink: nullSink(),
        createWriter: makeWriter([]),
        retry: { attempts: 3, delayMs: 0 },
      }),
    ).rejects.toThrow('Couldn\'t download storage file "loc-9" (HTTP 500).');
    expect(attempts).toBe(3);
  });

  test('names a pathless storage file by locationId when its download fails', async () => {
    const manager = {
      listFiles,
      getFileUrl,
      streamStorageFiles: async function* () {
        yield { locationId: 'loc-9', path: null, url: 'bad-url' };
      },
    } as any;

    await expect(
      downloadBackupArchive({
        manager,
        backup,
        fetchBody: async (url: string) => {
          if (url === 'bad-url') throw new Error('HTTP 500');
          return bodyOf('x');
        },
        sink: nullSink(),
        createWriter: makeWriter([]),
        retry: { attempts: 1 },
      }),
    ).rejects.toThrow('Couldn\'t download storage file "loc-9" (HTTP 500).');
  });
});

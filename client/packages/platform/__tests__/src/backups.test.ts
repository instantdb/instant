import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  BackupsManager,
  backupZipName,
  formatFileSize,
  type AppBackupStorageFile,
} from '../../src/backups.ts';

const makeManager = () =>
  new BackupsManager({
    appId: 'app-1',
    apiURI: 'http://api.test',
    withAuth: (operation) => operation('test-token'),
  });

const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

const stubFetchBody = (chunks: string[]) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(streamOf(chunks), { status: 200 })),
  );
};

const collect = async (manager: BackupsManager) => {
  const files: AppBackupStorageFile[] = [];
  for await (const file of manager.streamStorageFiles('backup-1')) {
    files.push(file);
  }
  return files;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('streamStorageFiles', () => {
  test('yields files and completes on the done sentinel', async () => {
    stubFetchBody([
      '{"locationId":"loc-1","path":"a.png","url":"http://s3/loc-1"}\n',
      '{"locationId":"loc-2","path":"b.png","url":"http://s3/loc-2"}\n',
      '{"done":true}\n',
    ]);

    const files = await collect(makeManager());
    expect(files).toEqual([
      { locationId: 'loc-1', path: 'a.png', url: 'http://s3/loc-1' },
      { locationId: 'loc-2', path: 'b.png', url: 'http://s3/loc-2' },
    ]);
  });

  test('handles lines split across chunks', async () => {
    stubFetchBody([
      '{"locationId":"loc-1","pa',
      'th":"a.png","url":"http://s3/loc-1"}\n{"done"',
      ':true}\n',
    ]);

    const files = await collect(makeManager());
    expect(files).toEqual([
      { locationId: 'loc-1', path: 'a.png', url: 'http://s3/loc-1' },
    ]);
  });

  test('throws on a record without a locationId or url', async () => {
    stubFetchBody([
      '{"path":"orphan.png"}\n',
      '{"locationId":"loc-1","path":"a.png","url":"http://s3/loc-1"}\n',
      '{"done":true}\n',
    ]);

    await expect(collect(makeManager())).rejects.toThrow(/malformed record/);
  });

  test('only accepts an exact done sentinel', async () => {
    stubFetchBody([
      '{"locationId":"loc-1","path":"a.png","url":"http://s3/loc-1"}\n',
      '{"done":1}\n',
    ]);

    await expect(collect(makeManager())).rejects.toThrow(/malformed record/);
  });

  test('completes without files when the app has none', async () => {
    stubFetchBody(['{"done":true}\n']);
    expect(await collect(makeManager())).toEqual([]);
  });

  test('rejects a locationId that could escape the archive path', async () => {
    stubFetchBody([
      '{"locationId":"../evil","path":"a.png","url":"http://s3/loc-1"}\n',
      '{"done":true}\n',
    ]);

    await expect(collect(makeManager())).rejects.toThrow(/malformed record/);
  });

  test('throws when the stream ends without the done sentinel', async () => {
    stubFetchBody([
      '{"locationId":"loc-1","path":"a.png","url":"http://s3/loc-1"}\n',
    ]);

    await expect(collect(makeManager())).rejects.toThrow(
      /ended before it finished/,
    );
  });
});

describe('list', () => {
  test('coerces the server row into an AppBackup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          backups: [
            {
              id: 'backup-1',
              isn: '42',
              backup_at: '2026-08-05T07:12:00Z',
              files_size: 100,
              db_size: 200,
              uncompressed_size: 300,
              description: 'Automated Daily Snapshot',
              expires_at: '2026-08-12T07:12:00Z',
            },
          ],
        }),
      ),
    );

    const [backup] = await makeManager().list();
    expect(backup).toEqual({
      id: 'backup-1',
      isn: '42',
      backupAt: new Date('2026-08-05T07:12:00Z'),
      filesSize: 100,
      dbSize: 200,
      uncompressedSize: 300,
      description: 'Automated Daily Snapshot',
      expiresAt: new Date('2026-08-12T07:12:00Z'),
    });
    expect(backupZipName(backup)).toBe(
      'instant-backup-2026-08-05T07-12-00-000Z.zip',
    );
  });
});

describe('formatFileSize', () => {
  test('formats with decimal units and adaptive precision', () => {
    expect(formatFileSize(999)).toBe('999 B');
    expect(formatFileSize(3510)).toBe('3.51 KB');
    expect(formatFileSize(1_540_000_000)).toBe('1.54 GB');
  });

  test('promotes across the unit boundary when rounding', () => {
    expect(formatFileSize(999_500)).toBe('1.00 MB');
    expect(formatFileSize(999_999_500)).toBe('1.00 GB');
  });
});

import { describe, expect, test, vi } from 'vitest';

import {
  BackupsManager,
  BackupDownloadError,
  canonicalizeBackupFiles,
  type BackupEntry,
  type InstantAppBackup,
} from '../../src/backup.ts';

const backup: InstantAppBackup = {
  id: 'backup-1',
  isn: '42',
  backup_at: '2026-08-05T12:34:56.789Z',
  files_size: 11,
  db_size: 12,
  uncompressed_size: 13,
  description: 'Daily snapshot',
  expires_at: '2026-08-12T12:34:56.789Z',
};

const json = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

const collectEntries = async (entries: AsyncIterable<BackupEntry>) => {
  const result: { name: string; body: string }[] = [];
  for await (const entry of entries) {
    result.push({
      name: entry.name,
      body: await new Response(entry.input).text(),
    });
  }
  return result;
};

const configOnlyFetch = (storageResponse: () => Response) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/files')) {
      return json({ files: [{ name: 'config.json', size: 1 }] });
    }
    if (url.includes('/file-url?')) {
      return json({ url: 'https://signed.test/config' });
    }
    if (url === 'https://signed.test/config') return new Response('{}');
    if (url.endsWith('/storage-files')) return storageResponse();
    throw new Error(`Unexpected request: ${url}`);
  });

describe('canonicalizeBackupFiles', () => {
  test('puts config first and sorts entity entries', () => {
    expect(
      canonicalizeBackupFiles([
        { name: 'entities/users.jsonl', size: 3 },
        { name: 'config.json', size: 1 },
        { name: 'entities/$files.jsonl', size: 2 },
        { name: 'entities/acme/posts.jsonl', size: 4 },
      ]).map((file) => file.name),
    ).toEqual([
      'config.json',
      'entities/$files.jsonl',
      'entities/acme/posts.jsonl',
      'entities/users.jsonl',
    ]);
  });

  test('accepts a config-only backup', () => {
    expect(canonicalizeBackupFiles([{ name: 'config.json', size: 1 }])).toEqual(
      [{ name: 'config.json', size: 1 }],
    );
  });

  test.each([
    {
      files: [{ name: 'entities/users.jsonl', size: 1 }],
      message: 'missing config.json',
    },
    {
      files: [
        { name: 'config.json', size: 1 },
        { name: 'config.json', size: 1 },
      ],
      message: 'duplicate entry',
    },
    {
      files: [
        { name: 'config.json', size: 1 },
        { name: 'files/already-zipped', size: 1 },
      ],
      message: 'unexpected entry',
    },
    {
      files: [
        { name: 'config.json', size: 1 },
        { name: 'entities/.jsonl', size: 1 },
      ],
      message: 'unexpected entry',
    },
    {
      files: [
        { name: 'config.json', size: 1 },
        { name: 'entities/acme/../secrets.jsonl', size: 1 },
      ],
      message: 'unexpected entry',
    },
    {
      files: [
        { name: 'config.json', size: 1 },
        { name: 'entities/acme/./posts.jsonl', size: 1 },
      ],
      message: 'unexpected entry',
    },
    {
      files: [
        { name: 'config.json', size: 1 },
        { name: 'entities/acme\\posts.jsonl', size: 1 },
      ],
      message: 'unexpected entry',
    },
    {
      files: [
        { name: 'config.json', size: 1 },
        { name: 'entities/acme\u001b.jsonl', size: 1 },
      ],
      message: 'unexpected entry',
    },
  ])('rejects malformed backup entries', ({ files, message }) => {
    expect(() => canonicalizeBackupFiles(files)).toThrow(message);
  });
});

describe('BackupsManager', () => {
  test('discovers storage in parallel and streams entries in restore order', async () => {
    const requests: string[] = [];
    let storageResponseRead = false;
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith('/backups/backup-1/files')) {
          expect(new Headers(init?.headers).get('authorization')).toBe(
            'Bearer secret',
          );
          return json({
            files: [
              { name: 'entities/users.jsonl', size: 30 },
              { name: 'config.json', size: 10 },
              { name: 'entities/$files.jsonl', size: 20 },
            ],
          });
        }
        if (url.includes('/file-url?name=config.json')) {
          return json({ url: 'https://signed.test/config' });
        }
        if (url.includes('name=entities%2F%24files.jsonl')) {
          return json({ url: 'https://signed.test/files-entity' });
        }
        if (url.includes('name=entities%2Fusers.jsonl')) {
          return json({ url: 'https://signed.test/users' });
        }
        if (url === 'https://signed.test/config') {
          return new Response('{"title":"Test"}');
        }
        if (url === 'https://signed.test/files-entity') {
          return new Response('{"entity":{"id":"file"}}\n');
        }
        if (url === 'https://signed.test/users') {
          expect(storageComplete).toBe(true);
          return new Response('{"entity":{"id":"user"}}\n');
        }
        if (url.endsWith('/storage-files')) {
          storageResponseRead = true;
          return new Response(
            [
              JSON.stringify({
                locationId: 'location-1',
                path: 'avatars/one.png',
                url: 'https://signed.test/location-1',
              }),
              JSON.stringify({
                locationId: 'location-2',
                path: null,
                url: 'https://signed.test/location-2',
              }),
              JSON.stringify({ done: true }),
              '',
            ].join('\n'),
          );
        }
        if (url === 'https://signed.test/location-1') {
          expect(storageResponseRead).toBe(true);
          return new Response('first file');
        }
        if (url === 'https://signed.test/location-2') {
          return new Response('second file');
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    const backupFiles: string[][] = [];
    const storageFiles: string[] = [];
    let storageComplete = false;
    const manager = new BackupsManager({
      apiURI: 'https://api.test',
      token: 'secret',
      fetch: fetch as typeof globalThis.fetch,
    });

    const entries = await collectEntries(
      manager.downloadEntries('app-1', backup, {
        callbacks: {
          onBackupFiles: (files) =>
            backupFiles.push(files.map((file) => file.name)),
          onStorageFile: (file) => storageFiles.push(file.locationId),
          onStorageComplete: () => {
            storageComplete = true;
          },
        },
      }),
    );

    expect(entries).toEqual([
      { name: 'config.json', body: '{"title":"Test"}' },
      {
        name: 'entities/$files.jsonl',
        body: '{"entity":{"id":"file"}}\n',
      },
      {
        name: 'entities/users.jsonl',
        body: '{"entity":{"id":"user"}}\n',
      },
      { name: 'files/location-1', body: 'first file' },
      { name: 'files/location-2', body: 'second file' },
    ]);
    expect(backupFiles).toEqual([
      ['config.json', 'entities/$files.jsonl', 'entities/users.jsonl'],
    ]);
    expect(storageFiles).toEqual(['location-1', 'location-2']);
    expect(storageComplete).toBe(true);

    const storageIndex = requests.findIndex((url) =>
      url.endsWith('/storage-files'),
    );
    const lastEntityIndex = requests.indexOf('https://signed.test/users');
    expect(storageIndex).toBeLessThan(lastEntityIndex);
  });

  test('downloads a config-only backup through the body decoder', async () => {
    const decodeBackupBody = vi.fn(async (response: Response) => {
      const body = await response.text();
      return new Response(`decoded:${body}`).body!;
    });
    const manager = new BackupsManager({
      apiURI: 'https://api.test',
      token: 'secret',
      fetch: configOnlyFetch(
        () => new Response(`${JSON.stringify({ done: true })}\n`),
      ) as typeof globalThis.fetch,
      decodeBackupBody,
    });

    await expect(
      collectEntries(manager.downloadEntries('app-1', backup)),
    ).resolves.toEqual([{ name: 'config.json', body: 'decoded:{}' }]);
    expect(decodeBackupBody).toHaveBeenCalledOnce();
  });

  test('parses CRLF NDJSON at arbitrary byte boundaries', async () => {
    const storageFile = {
      locationId: 'legacy/文件',
      path: 'café/猫.png',
      url: 'https://signed.test/unicode-file',
    };
    const listing = [
      '',
      JSON.stringify(storageFile),
      '',
      JSON.stringify({ done: true }),
      '',
    ].join('\r\n');
    const bytes = new TextEncoder().encode(listing);
    const storagePaths: (string | null)[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/files')) {
        return json({ files: [{ name: 'config.json', size: 1 }] });
      }
      if (url.includes('/file-url?')) {
        return json({ url: 'https://signed.test/config' });
      }
      if (url === 'https://signed.test/config') return new Response('{}');
      if (url.endsWith('/storage-files')) {
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
              controller.close();
            },
          }),
        );
      }
      if (url === storageFile.url) return new Response('unicode body');
      throw new Error(`Unexpected request: ${url}`);
    });
    const manager = new BackupsManager({
      apiURI: 'https://api.test',
      token: 'secret',
      fetch: fetch as typeof globalThis.fetch,
    });

    const entries = await collectEntries(
      manager.downloadEntries('app-1', backup, {
        callbacks: {
          onStorageFile: (file) => storagePaths.push(file.path),
        },
      }),
    );

    expect(entries).toEqual([
      { name: 'config.json', body: '{}' },
      { name: 'files/legacy/文件', body: 'unicode body' },
    ]);
    expect(storagePaths).toEqual(['café/猫.png']);
  });

  test.each([
    {
      name: 'data after completion',
      listing: [
        JSON.stringify({ done: true }),
        JSON.stringify({
          locationId: 'late-file',
          path: 'late.txt',
          url: 'https://signed.test/late-file',
        }),
      ].join('\n'),
      message: 'data after its completion marker',
    },
    {
      name: 'a duplicate completion marker',
      listing: [
        JSON.stringify({ done: true }),
        JSON.stringify({ done: true }),
      ].join('\n'),
      message: 'more than one completion marker',
    },
  ])('rejects $name', async ({ listing, message }) => {
    const manager = new BackupsManager({
      apiURI: 'https://api.test',
      token: 'secret',
      fetch: configOnlyFetch(
        () => new Response(listing),
      ) as typeof globalThis.fetch,
    });

    await expect(
      collectEntries(manager.downloadEntries('app-1', backup)),
    ).rejects.toThrow(message);
  });

  test('treats a storage listing 404 as an error', async () => {
    const manager = new BackupsManager({
      apiURI: 'https://api.test',
      token: 'secret',
      fetch: configOnlyFetch(() =>
        json({ message: 'Backup expired' }, { status: 404 }),
      ) as typeof globalThis.fetch,
    });

    await expect(
      collectEntries(manager.downloadEntries('app-1', backup)),
    ).rejects.toThrow(
      'Listing storage files failed with HTTP 404: Backup expired',
    );
  });

  test('rejects a truncated storage listing', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/files')) {
        return json({ files: [{ name: 'config.json', size: 1 }] });
      }
      if (url.includes('/file-url?')) {
        return json({ url: 'https://signed.test/config' });
      }
      if (url === 'https://signed.test/config') return new Response('{}');
      if (url.endsWith('/storage-files')) {
        return new Response(
          `${JSON.stringify({
            locationId: 'location-1',
            path: 'one.txt',
            url: 'https://signed.test/location-1',
          })}\n`,
        );
      }
      if (url === 'https://signed.test/location-1') {
        return new Response('one');
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const manager = new BackupsManager({
      apiURI: 'https://api.test',
      token: 'secret',
      fetch: fetch as typeof globalThis.fetch,
    });

    await expect(
      collectEntries(manager.downloadEntries('app-1', backup)),
    ).rejects.toThrow('ended before it finished');
  });

  test('rejects duplicate, blank, and unsafe storage location IDs', async () => {
    const run = async (locations: string[]) => {
      const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/files')) {
          return json({ files: [{ name: 'config.json', size: 1 }] });
        }
        if (url.includes('/file-url?')) {
          return json({ url: 'https://signed.test/config' });
        }
        if (url === 'https://signed.test/config') return new Response('{}');
        if (url.endsWith('/storage-files')) {
          return new Response(
            [
              ...locations.map((locationId) =>
                JSON.stringify({
                  locationId,
                  path: 'file.txt',
                  url: `https://signed.test/${encodeURIComponent(locationId)}`,
                }),
              ),
              JSON.stringify({ done: true }),
            ].join('\n'),
          );
        }
        if (url.startsWith('https://signed.test/')) {
          return new Response('file');
        }
        throw new Error(`Unexpected request: ${url}`);
      });
      const manager = new BackupsManager({
        apiURI: 'https://api.test',
        token: 'secret',
        fetch: fetch as typeof globalThis.fetch,
      });
      return collectEntries(manager.downloadEntries('app-1', backup));
    };

    await expect(run(['same', 'same'])).rejects.toThrow('duplicate entry');
    await expect(run(['   '])).rejects.toThrow('blank location ID on line 1');
    await expect(run(['legacy/../unsafe'])).rejects.toThrow(
      'invalid storage location ID',
    );
    await expect(run(['legacy/./unsafe'])).rejects.toThrow(
      'invalid storage location ID',
    );
    await expect(run(['legacy\\unsafe'])).rejects.toThrow(
      'invalid storage location ID',
    );
    await expect(run(['unsafe\u001b'])).rejects.toThrow(
      'invalid storage location ID',
    );
  });

  test('preserves legacy slash-bearing storage location IDs', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/files')) {
        return json({ files: [{ name: 'config.json', size: 1 }] });
      }
      if (url.includes('/file-url?')) {
        return json({ url: 'https://signed.test/config' });
      }
      if (url === 'https://signed.test/config') return new Response('{}');
      if (url.endsWith('/storage-files')) {
        return new Response(
          [
            JSON.stringify({
              locationId: 'legacy/path',
              path: 'file.txt',
              url: 'https://signed.test/legacy',
            }),
            JSON.stringify({ done: true }),
          ].join('\n'),
        );
      }
      if (url === 'https://signed.test/legacy') return new Response('file');
      throw new Error(`Unexpected request: ${url}`);
    });
    const manager = new BackupsManager({
      apiURI: 'https://api.test',
      token: 'secret',
      fetch: fetch as typeof globalThis.fetch,
    });

    const entries = await collectEntries(
      manager.downloadEntries('app-1', backup),
    );
    expect(entries.at(-1)?.name).toBe('files/legacy/path');
  });

  test('surfaces server errors without leaking non-JSON bodies', async () => {
    const manager = new BackupsManager({
      apiURI: 'https://api.test',
      token: 'secret',
      fetch: vi.fn(async () =>
        json(
          { message: 'Backup expired' },
          { status: 404, statusText: 'Not Found' },
        ),
      ) as typeof globalThis.fetch,
    });

    await expect(manager.list('app-1')).rejects.toEqual(
      new BackupDownloadError(
        'Listing backups failed with HTTP 404: Backup expired',
      ),
    );
  });
});

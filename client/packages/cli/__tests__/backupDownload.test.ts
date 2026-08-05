import { test, expect, describe, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { once } from 'node:events';
import zlib from 'node:zlib';
import { downloadBackupToFile } from '../src/lib/backupDownload.ts';

// Exercises the real pipeline end-to-end against a local HTTP server: zstd
// decompression of entity shards, canonical entry order (config.json, then
// entities/*.jsonl, then files/<locationId>), and the partial-file rename.

// Not yet in this @types/node version, same as createZstdDecompress in the
// pipeline itself.
const zstd = (s: string): Buffer =>
  (zlib as any).zstdCompressSync(Buffer.from(s));

const bodies: Record<string, { body: Buffer; encoding?: string }> = {
  '/config.json': { body: zstd('{"schema":{}}'), encoding: 'zstd' },
  '/entities/todos.jsonl': {
    body: zstd('{"entity":{"id":"1"}}\n'),
    encoding: 'zstd',
  },
  '/entities/$files.jsonl': {
    body: zstd('{"entity":{"location-id":"loc-1"}}\n'),
    encoding: 'zstd',
  },
  '/blobs/loc-1': { body: Buffer.from('blob-one') },
  '/blobs/loc-2': { body: Buffer.from('blob-two') },
};

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const found = bodies[req.url ?? ''];
    if (!found) {
      res.writeHead(404).end();
      return;
    }
    const headers: Record<string, string> = {};
    if (found.encoding) headers['content-encoding'] = found.encoding;
    res.writeHead(200, headers).end(found.body);
  });
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (typeof address === 'string' || address === null) {
    throw new Error('Expected a TCP address');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
});

const backup = {
  id: 'backup-1',
  isn: '1',
  backupAt: new Date('2026-08-01T00:00:00Z'),
  filesSize: 16,
  dbSize: 100,
  uncompressedSize: 40,
  description: null,
  expiresAt: new Date('2026-08-08T00:00:00Z'),
};

const storageFiles = [
  { locationId: 'loc-1', path: 'a.png', url: () => `${baseUrl}/blobs/loc-1` },
  { locationId: 'loc-2', path: 'b.png', url: () => `${baseUrl}/blobs/loc-2` },
];

const manager = {
  listFiles: async (_backupId: string) => [
    { name: 'config.json', size: 10 },
    { name: 'entities/todos.jsonl', size: 10 },
    { name: 'entities/$files.jsonl', size: 10 },
  ],
  getFileUrl: async (_backupId: string, name: string) => `${baseUrl}/${name}`,
  streamStorageFiles: async function* (
    _backupId: string,
    _opts?: { signal?: AbortSignal },
  ) {
    for (const f of storageFiles) {
      yield { locationId: f.locationId, path: f.path, url: f.url() };
    }
  },
} as any;

const outPath = join(tmpdir(), `backup-download-test-${process.pid}.zip`);

// The partial file carries a random suffix, so scan for leftovers by prefix.
const partialLeftovers = () =>
  readdirSync(tmpdir()).filter((f) =>
    f.startsWith(`${basename(outPath)}.partial`),
  );

afterEach(async () => {
  await rm(outPath, { force: true });
  for (const f of partialLeftovers()) {
    await rm(join(tmpdir(), f), { force: true });
  }
});

describe('downloadBackupToFile', () => {
  test('writes a zip with the canonical entry order', async () => {
    const result = await downloadBackupToFile({
      manager,
      backup,
      outPath,
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    expect(result.entities).toBe(2);
    expect(result.files).toBe(2);
    expect(partialLeftovers()).toEqual([]);

    const { ZipReader, Uint8ArrayReader, TextWriter } = await import(
      '@zip.js/zip.js'
    );
    const reader = new ZipReader(
      new Uint8ArrayReader(new Uint8Array(await readFile(outPath))),
    );
    const entries = await reader.getEntries();

    // Entry order is the restore contract: config first, all entity shards
    // before any storage blob.
    expect(entries.map((e) => e.filename)).toEqual([
      'config.json',
      'entities/todos.jsonl',
      'entities/$files.jsonl',
      'files/loc-1',
      'files/loc-2',
    ]);

    // Entity shards land decompressed; blobs land verbatim.
    const readText = (entry: any) => entry.getData(new TextWriter());
    expect(await readText(entries[0])).toBe('{"schema":{}}');
    expect(await readText(entries[1])).toBe('{"entity":{"id":"1"}}\n');
    expect(await readText(entries[3])).toBe('blob-one');
    expect(await readText(entries[4])).toBe('blob-two');
    await reader.close();
  });

  test('removes the partial file when a fetch fails', async () => {
    const failingManager = {
      ...manager,
      getFileUrl: async (_backupId: string, name: string) =>
        `${baseUrl}/missing-${name}`,
    };

    await expect(
      downloadBackupToFile({
        manager: failingManager,
        backup,
        outPath,
        signal: new AbortController().signal,
        onProgress: () => {},
      }),
    ).rejects.toThrow(/Failed to fetch config.json/);

    expect(existsSync(outPath)).toBe(false);
    expect(partialLeftovers()).toEqual([]);
  });

  test('aborting removes the partial file', async () => {
    const controller = new AbortController();
    const slowManager = {
      ...manager,
      streamStorageFiles: async function* () {
        yield {
          locationId: 'loc-1',
          path: 'a.png',
          url: `${baseUrl}/blobs/loc-1`,
        };
        controller.abort();
        // Give the pipeline a moment to observe the abort mid-drain.
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
    };

    await expect(
      downloadBackupToFile({
        manager: slowManager,
        backup,
        outPath,
        signal: controller.signal,
        onProgress: () => {},
      }),
    ).rejects.toThrow();

    expect(existsSync(outPath)).toBe(false);
    expect(partialLeftovers()).toEqual([]);
  });
});

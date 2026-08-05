import { createWriteStream } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { once } from 'node:events';
import { get as httpGet, type IncomingMessage } from 'node:http';
import { get as httpsGet } from 'node:https';
import { Readable, Transform, Writable, type Duplex } from 'node:stream';
import zlib from 'node:zlib';
import type {
  AppBackup,
  AppBackupStorageFile,
  BackupsManager,
} from '@instantdb/platform';

export type BackupDownloadProgress = {
  entitiesCompleted: number;
  entitiesTotal: number | null;
  filesCompleted: number;
  filesTotal: number | null;
  // Compressed bytes written to disk so far (the zip's on-disk size).
  zipBytes: number;
  // Uncompressed bytes read from source bodies, and the backup's known
  // uncompressed total — the numerator/denominator for a progress bar.
  // bytesTotal is null when the backup row carries no sizes.
  bytesRead: number;
  bytesTotal: number | null;
  // The entry currently being fetched; empty between phases.
  currentEntry: string;
};

export type BackupDownloadResult = {
  entities: number;
  files: number;
  zipBytes: number;
};

// zstd landed in node:zlib in 22.15 / 23.8; on older Nodes the property is
// absent, so feature-detect instead of assuming the type declarations match
// the runtime.
const createZstdDecompress: (() => Duplex) | undefined = (
  zlib as { createZstdDecompress?: () => Duplex }
).createZstdDecompress;

function fetchStream(
  url: string,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https:') ? httpsGet : httpGet;
    const req = get(url, { signal }, resolve);
    req.on('error', reject);
  });
}

// .pipe doesn't forward errors, so a source failure would otherwise leave the
// destination (and the zip writer reading from it) hanging forever.
function pipe(src: Readable, dst: Duplex): Duplex {
  src.on('error', (e) => dst.destroy(e));
  return src.pipe(dst);
}

/**
 * Downloads a backup into a zip file at `outPath`, matching the archive the
 * dashboard produces: entries are written in the canonical restore order
 * (`config.json`, then the `entities/<etype>.jsonl` shards, then
 * `files/<locationId>` storage blobs — all entity files before any storage
 * file), zip64 so archives past 4GB stay readable, and disk backpressure so
 * memory stays flat regardless of backup size.
 *
 * Writes to `<outPath>.partial` and renames on success; a failed or aborted
 * download removes the partial file.
 */
export async function downloadBackupToFile(opts: {
  manager: BackupsManager;
  backup: AppBackup;
  outPath: string;
  signal: AbortSignal;
  onProgress: (progress: BackupDownloadProgress) => void;
}): Promise<BackupDownloadResult> {
  const { manager, backup, outPath, onProgress } = opts;

  // The entity shards are served with `Content-Encoding: zstd`; fail before
  // writing anything if this Node can't decompress them.
  if (!createZstdDecompress) {
    throw new Error(
      'Downloading backups requires Node 22.15 or newer (for zstd support).',
    );
  }

  // Internal controller so a zip-pipeline failure also tears down the
  // storage-files discovery stream and any in-flight body fetches.
  const abortController = new AbortController();
  if (opts.signal.aborted) {
    abortController.abort();
  } else {
    opts.signal.addEventListener('abort', () => abortController.abort(), {
      once: true,
    });
  }
  const signal = abortController.signal;

  let entitiesCompleted = 0;
  let entitiesTotal: number | null = null;
  let filesCompleted = 0;
  let filesTotal: number | null = null;
  let zipBytes = 0;
  let bytesRead = 0;
  let currentEntry = '';
  const bytesTotal =
    backup.uncompressedSize != null
      ? backup.uncompressedSize + (backup.filesSize ?? 0)
      : null;

  const tick = () =>
    onProgress({
      entitiesCompleted,
      entitiesTotal,
      filesCompleted,
      filesTotal,
      zipBytes,
      bytesRead,
      bytesTotal,
      currentEntry,
    });

  // Throttle by time: a large backup pushes many small chunks and ticking on
  // every one is wasted work. Phase changes tick() directly so they're still
  // immediate.
  const TICK_INTERVAL_MS = 100;
  let lastTickAt = 0;
  const throttledTick = () => {
    const now = Date.now();
    if (now - lastTickAt >= TICK_INTERVAL_MS) {
      lastTickAt = now;
      tick();
    }
  };

  // Wrap a source body for the zip: decompress if the object is stored
  // compressed, and count the uncompressed bytes for progress.
  const toEntryStream = (res: IncomingMessage): ReadableStream<Uint8Array> => {
    const encoding = res.headers['content-encoding'];
    let stream: Readable = res;
    if (encoding === 'zstd') {
      stream = pipe(stream, createZstdDecompress());
    } else if (encoding === 'gzip') {
      stream = pipe(stream, zlib.createGunzip());
    } else if (encoding) {
      res.destroy();
      throw new Error(`Unsupported content encoding: ${encoding}`);
    }
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytesRead += chunk.length;
        throttledTick();
        cb(null, chunk);
      },
    });
    return Readable.toWeb(pipe(stream, counter)) as ReadableStream<Uint8Array>;
  };

  // Storage-files discovery runs concurrently with the entity phase and is
  // drained eagerly into a queue. That isn't just overlap: it closes the
  // NDJSON connection quickly instead of holding it open (and at the mercy of
  // idle timeouts) while multi-GB blobs download. `queueHead` walks the array
  // in place, freeing each slot as it's consumed.
  const queue: (AppBackupStorageFile | undefined)[] = [];
  let queueHead = 0;
  let storageDone = false;
  let storageError: Error | null = null;
  let waitResolve: (() => void) | null = null;
  const notify = () => {
    const w = waitResolve;
    waitResolve = null;
    w?.();
  };

  // Never rejects: failures land in storageError for the drain loop to throw.
  const discovery = (async () => {
    let discoveryComplete = false;
    try {
      for await (const file of manager.streamStorageFiles(backup.id, {
        signal,
      })) {
        queue.push(file);
        filesTotal = (filesTotal ?? 0) + 1;
        throttledTick();
        notify();
      }
      discoveryComplete = true;
    } catch (e) {
      // The abort path is expected when the zip pipeline failed and we tore
      // the discovery down.
      if ((e as { name?: string })?.name !== 'AbortError') {
        storageError = e as Error;
      }
    } finally {
      // A failed listing keeps the total unknown rather than reading as an
      // empty-but-complete storage phase.
      if (discoveryComplete && filesTotal == null) filesTotal = 0;
      storageDone = true;
      tick();
      notify();
    }
  })();

  // Entry write order is significant for restore: config.json first, then the
  // entities/*.jsonl shards, then files/<locationId>. In particular ALL entity
  // files must be written before ANY storage file. listFiles returns the
  // entity files in write order; this generator yields them to completion,
  // then drains the storage queue.
  type ZipEntry = { name: string; input: ReadableStream<Uint8Array> };
  const entries = (async function* (): AsyncGenerator<ZipEntry> {
    const files = await manager.listFiles(backup.id, { signal });
    if (files.length === 0) {
      throw new Error('No files found for this backup.');
    }
    // config.json isn't a namespace — count only the entities/*.jsonl shards.
    entitiesTotal = files.filter((f) => f.name !== 'config.json').length;
    tick();

    for (const f of files) {
      currentEntry = f.name;
      tick();
      const url = await manager.getFileUrl(backup.id, f.name, { signal });
      const res = await fetchStream(url, signal);
      if (res.statusCode !== 200) {
        res.resume();
        throw new Error(`Failed to fetch ${f.name}: HTTP ${res.statusCode}.`);
      }
      if (f.name !== 'config.json') entitiesCompleted++;
      tick();
      yield { name: f.name, input: toEntryStream(res) };
    }
    currentEntry = '';
    tick();

    while (true) {
      if (storageError) throw storageError;
      let file: AppBackupStorageFile | undefined;
      if (queueHead < queue.length) {
        file = queue[queueHead];
        queue[queueHead] = undefined;
        queueHead++;
      }
      if (file) {
        currentEntry = file.path || file.locationId;
        tick();
        const res = await fetchStream(file.url, signal);
        if (res.statusCode !== 200) {
          res.resume();
          throw new Error(
            `Couldn't download storage file "${file.path}" (HTTP ${res.statusCode}).`,
          );
        }
        filesCompleted++;
        tick();
        yield { name: `files/${file.locationId}`, input: toEntryStream(res) };
      } else if (storageDone) {
        break;
      } else {
        await new Promise<void>((resolve) => {
          waitResolve = resolve;
        });
      }
    }
    currentEntry = '';
    tick();

    if (storageError) throw storageError;
  })();

  const partialPath = `${outPath}.partial`;
  const fileStream = createWriteStream(partialPath);
  const diskWriter = (
    Writable.toWeb(fileStream) as WritableStream<Uint8Array>
  ).getWriter();
  const awaitFileClosed = async () => {
    if (!fileStream.closed) await once(fileStream, 'close');
  };
  try {
    // Loaded on demand so every other CLI command skips parsing it.
    const { ZipWriter } = await import('@zip.js/zip.js');
    // Sink that zip.js writes compressed bytes into: it tallies the on-disk
    // size for progress, then forwards to the file. Awaiting the disk write
    // propagates backpressure up into zip.js, so a fast source can't outrun
    // the disk and balloon memory.
    const countingSink = new WritableStream<Uint8Array>({
      async write(chunk) {
        zipBytes += chunk.byteLength;
        throttledTick();
        await diskWriter.write(chunk);
      },
      async close() {
        await diskWriter.close();
        tick();
      },
      async abort(reason) {
        await diskWriter.abort(reason);
      },
    });

    // zip64: without it any archive whose central-directory offset passes 4GB
    // writes a wrapped 32-bit offset and the zip is unreadable.
    const zipWriter = new ZipWriter(countingSink, { zip64: true, signal });
    for await (const entry of entries) {
      await zipWriter.add(entry.name, entry.input, {
        lastModDate: backup.backupAt,
      });
    }
    await zipWriter.close();
    await awaitFileClosed();
    await rename(partialPath, outPath);
    await discovery;
    tick();
    return { entities: entitiesCompleted, files: filesCompleted, zipBytes };
  } catch (e) {
    // Tear down the discovery stream and any in-flight body fetches so we
    // don't keep pulling from S3, and discard the partial file on disk.
    abortController.abort();
    await diskWriter.abort(e).catch(() => {});
    await awaitFileClosed().catch(() => {});
    await unlink(partialPath).catch(() => {});
    throw e;
  }
}

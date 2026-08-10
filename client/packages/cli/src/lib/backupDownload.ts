import { createWriteStream } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { get as httpGet, type IncomingMessage } from 'node:http';
import { get as httpsGet } from 'node:https';
import { Readable, Writable, type Duplex } from 'node:stream';
import zlib from 'node:zlib';
import type {
  AppBackup,
  BackupArchiveWriter,
  BackupDownloadProgress,
  BackupDownloadResult,
  BackupsManager,
} from '@instantdb/platform';
import version from '../version.js';

// Set a user-agent or else cloudfront might block the request
const userAgent = `instant-cli/${version}`;

export type {
  BackupDownloadProgress,
  BackupDownloadResult,
} from '@instantdb/platform';

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
    const req = get(
      url,
      { signal, headers: { 'user-agent': userAgent } },
      resolve,
    );
    req.on('error', reject);
  });
}

// .pipe doesn't forward errors, so a source failure would otherwise leave the
// destination (and the zip writer reading from it) hanging forever.
function pipe(src: Readable, dst: Duplex): Duplex {
  src.on('error', (e) => dst.destroy(e));
  return src.pipe(dst);
}

// S3/CloudFront answer a rejected presigned URL with a short XML body naming
// the actual cause (SignatureDoesNotMatch, AccessDenied, expired, …). Read a
// bounded prefix so the error surfaces the reason instead of a bare status.
async function readErrorBody(res: IncomingMessage): Promise<string> {
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of res) {
      chunks.push(chunk as Buffer);
      total += (chunk as Buffer).length;
      if (total >= 2048) break;
    }
    return Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
  } catch {
    return '';
  } finally {
    res.destroy();
  }
}

// Fetches a presigned URL with node:http(s), decompressing explicitly: the
// entity shards are served with `Content-Encoding: zstd` and Node doesn't
// auto-decompress that. downloadBackupToFile refuses to run without zstd
// support, so the assertion below can't fire.
async function fetchBody(
  url: string,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetchStream(url, signal);
  if (res.statusCode !== 200) {
    const body = await readErrorBody(res);
    throw new Error(`HTTP ${res.statusCode}${body ? ` — ${body}` : ''}`);
  }
  const encoding = res.headers['content-encoding'];
  let stream: Readable = res;
  if (encoding === 'zstd') {
    stream = pipe(stream, createZstdDecompress!());
  } else if (encoding === 'gzip') {
    stream = pipe(stream, zlib.createGunzip());
  } else if (encoding) {
    res.destroy();
    throw new Error(`Unsupported content encoding: ${encoding}`);
  }
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

async function createZipWriter(
  sink: WritableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<BackupArchiveWriter> {
  // Loaded on demand so every other CLI command skips parsing it.
  const { ZipWriter } = await import('@zip.js/zip.js');
  // zip64: without it any archive whose central-directory offset passes 4GB
  // writes a wrapped 32-bit offset and the zip is unreadable.
  return new ZipWriter(sink, { zip64: true, signal });
}

/**
 * Downloads a backup into a zip file at `outPath` via the shared
 * `BackupsManager.downloadArchive` pipeline, supplying the Node-specific
 * pieces:
 * presigned URLs are fetched with node:http(s) and decompressed explicitly,
 * and the archive streams to disk with backpressure so memory stays flat
 * regardless of backup size.
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
  // The entity shards are served with `Content-Encoding: zstd`; fail before
  // writing anything if this Node can't decompress them.
  if (!createZstdDecompress) {
    throw new Error(
      'Downloading backups requires Node 22.15 or newer (for zstd support).',
    );
  }

  // Randomized so a stale partial or a concurrent download of the same
  // backup can't collide; 'wx' turns any remaining collision into an error
  // instead of silently truncating another run's file.
  const partialPath = `${opts.outPath}.partial-${randomBytes(4).toString('hex')}`;
  const fileStream = createWriteStream(partialPath, { flags: 'wx' });
  const awaitFileClosed = async () => {
    if (!fileStream.closed) await once(fileStream, 'close');
  };
  try {
    const result = await opts.manager.downloadArchive({
      backup: opts.backup,
      fetchBody,
      sink: Writable.toWeb(fileStream) as WritableStream<Uint8Array>,
      createWriter: createZipWriter,
      signal: opts.signal,
      onProgress: opts.onProgress,
    });
    await awaitFileClosed();
    // Flush to disk before the rename so a crash right after can't leave a
    // complete-looking zip with unwritten tails.
    const fh = await open(partialPath, 'r+');
    try {
      await fh.sync();
    } finally {
      await fh.close();
    }
    await rename(partialPath, opts.outPath);
    return result;
  } catch (e) {
    // The pipeline already aborted the sink; wait for the fd to close, then
    // discard the partial file on disk.
    await awaitFileClosed().catch(() => {});
    await unlink(partialPath).catch(() => {});
    throw e;
  }
}

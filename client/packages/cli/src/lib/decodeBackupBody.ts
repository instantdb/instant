import { Readable } from 'node:stream';
import type { Transform } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { BackupDownloadError } from '@instantdb/platform';

const zstdMagic = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]);

type ZlibWithZstd = typeof import('node:zlib') & {
  createZstdDecompress?: () => Transform;
};

function replayStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  chunks: Uint8Array[],
): ReadableStream<Uint8Array> {
  let chunkIndex = 0;
  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    reader.releaseLock();
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(chunks[chunkIndex++]);
        return;
      }

      try {
        const { done, value } = await reader.read();
        if (done) {
          release();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        release();
        throw error;
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        release();
      }
    },
  });
}

async function peek(
  body: ReadableStream<Uint8Array>,
  byteCount: number,
): Promise<{ prefix: Uint8Array; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    while (length < byteCount) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.byteLength;
    }
  } catch (error) {
    reader.releaseLock();
    throw error;
  }

  const prefix = new Uint8Array(Math.min(length, byteCount));
  let offset = 0;
  for (const chunk of chunks) {
    const remaining = prefix.byteLength - offset;
    if (remaining === 0) break;
    const part = chunk.subarray(0, remaining);
    prefix.set(part, offset);
    offset += part.byteLength;
  }

  return { prefix, stream: replayStream(reader, chunks) };
}

const hasZstdMagic = (prefix: Uint8Array) =>
  prefix.byteLength === zstdMagic.byteLength &&
  prefix.every((byte, index) => byte === zstdMagic[index]);

/**
 * Backup entries are stored zstd-compressed in S3. Depending on the Node
 * version, fetch may have already decompressed the body (undici only gained
 * zstd support recently), so sniff the magic bytes and only decompress when
 * the body is still compressed.
 */
export async function decodeNodeBackupBody(
  response: Response,
): Promise<ReadableStream<Uint8Array>> {
  if (!response.body) {
    throw new BackupDownloadError('Backup entry response has no body.');
  }

  const { prefix, stream } = await peek(response.body, zstdMagic.byteLength);
  if (!hasZstdMagic(prefix)) return stream;

  const zlib = (await import('node:zlib')) as ZlibWithZstd;
  if (!zlib.createZstdDecompress) {
    await stream.cancel().catch(() => undefined);
    throw new BackupDownloadError(
      `Node.js ${process.versions.node} does not support Zstandard decompression. Upgrade Node.js and try again.`,
    );
  }

  const input = Readable.fromWeb(stream as unknown as NodeReadableStream);
  const output = input.pipe(zlib.createZstdDecompress());
  input.on('error', (error) => output.destroy(error));
  output.on('error', () => input.destroy());
  output.on('close', () => {
    if (!output.readableEnded) input.destroy();
  });
  return Readable.toWeb(output) as ReadableStream<Uint8Array>;
}

import * as zlib from 'node:zlib';
import { describe, expect, test, vi } from 'vitest';
import { decodeNodeBackupBody } from '../src/lib/decodeBackupBody.ts';

const { zstdCompressSync } = zlib as unknown as {
  zstdCompressSync: (input: Uint8Array) => Uint8Array;
};

const bytes = (value: string) => new TextEncoder().encode(value);

const responseFromChunks = (chunks: Uint8Array[], onCancel?: () => void) =>
  new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk) {
          controller.enqueue(chunk);
        } else {
          controller.close();
        }
      },
      cancel() {
        onCancel?.();
      },
    }),
    { headers: { 'content-encoding': 'zstd' } },
  );

const readText = async (stream: ReadableStream<Uint8Array>) =>
  new Response(stream).text();

describe('decodeNodeBackupBody', () => {
  test('passes through bodies fetch has already decoded', async () => {
    const body = bytes('{"posts":[]}');
    const decoded = await decodeNodeBackupBody(
      responseFromChunks([body.subarray(0, 2), body.subarray(2)]),
    );

    expect(await readText(decoded)).toBe('{"posts":[]}');
  });

  test('decompresses zstd bodies with fragmented magic bytes', async () => {
    const compressed = zstdCompressSync(bytes('{"posts":[1,2,3]}'));
    const decoded = await decodeNodeBackupBody(
      responseFromChunks([
        compressed.subarray(0, 1),
        compressed.subarray(1, 3),
        compressed.subarray(3, 7),
        compressed.subarray(7),
      ]),
    );

    expect(await readText(decoded)).toBe('{"posts":[1,2,3]}');
  });

  test('cancels the response body when the decoded stream is canceled', async () => {
    const onCancel = vi.fn();
    const decoded = await decodeNodeBackupBody(
      responseFromChunks([bytes('plain body'), bytes('more')], onCancel),
    );

    await decoded.cancel('stopped');

    expect(onCancel).toHaveBeenCalledOnce();
  });

  test('fails clearly when Node does not support zstd', async () => {
    vi.doMock('node:zlib', () => ({ createZstdDecompress: undefined }));
    try {
      await expect(
        decodeNodeBackupBody(
          new Response(new Uint8Array([0x28, 0xb5, 0x2f, 0xfd])),
        ),
      ).rejects.toThrow(
        'does not support Zstandard decompression. Upgrade Node.js and try again.',
      );
    } finally {
      vi.doUnmock('node:zlib');
    }
  });
});

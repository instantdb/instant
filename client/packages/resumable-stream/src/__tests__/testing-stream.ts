export function createTestingStream() {
  let controller: ReadableStreamDefaultController<string> | undefined =
    undefined;
  const buffer: string[] = [];
  const readable = new ReadableStream<string>({
    start(c) {
      controller = c;
      if (buffer.length > 0) {
        for (const chunk of buffer) {
          controller.enqueue(chunk);
        }
      }
    },
  });

  const writable = new WritableStream<string>({
    write(chunk) {
      if (controller) {
        controller.enqueue(chunk);
      }
      buffer.push(chunk);
    },
    close() {
      controller?.close();
    },
    abort(reason) {
      controller?.error(reason);
    },
  });

  return {
    readable,
    writer: writable.getWriter(),
    buffer,
  };
}

const readers = new WeakMap<
  ReadableStream<string>,
  ReadableStreamDefaultReader<string>
>();

export async function streamToBuffer(
  stream: ReadableStream<string> | null | undefined,
  maxNReads?: number,
) {
  if (stream === null) {
    throw new Error('Stream should not be null');
  }
  if (stream === undefined) {
    throw new Error('Stream should not be undefined');
  }

  const reader = (
    readers.has(stream) ? readers.get(stream) : stream.getReader()
  ) as ReadableStreamDefaultReader<string>;
  readers.set(stream, reader);

  const buffer: string[] = [];
  function timeout(ms: number) {
    return new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`Timeout with buffer ${JSON.stringify(buffer)}`),
          ),
        ms,
      ),
    );
  }

  let i = 0;
  while (true) {
    const { done, value } = await (Promise.race([
      reader.read(),
      timeout(2000),
    ]) as Promise<{ done: boolean; value: string }>);
    if (!done) {
      buffer.push(value);
    }
    if (maxNReads && ++i === maxNReads) {
      break;
    }
    if (done) {
      break;
    }
  }
  return buffer.join('');
}

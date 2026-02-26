import { init } from '@instantdb/admin';

export interface CreateResumableStreamContextOptions {
  /**
   * A function that takes a promise and ensures that the current program stays alive
   * until the promise is resolved.
   *
   * If you are deploying to a server environment, where you don't have to worry about
   * the function getting suspended, pass in null.
   */
  waitUntil: ((promise: Promise<unknown>) => void) | null;
  /**
   * The appId for your InstantDB app. It may also be provided with the INSTANT_APP_ID environment variable.
   */
  appId?: string;
  /**
   * The appId for your InstantDB app. It may also be provided with the INSTANT_ADMIN_TOKEN environment variable.
   */
  adminToken?: string;
  /**
   * Optional apiURI for the instantdb server.
   */
  apiURI?: string;
}

export interface ResumableStreamContext {
  /**
   * Creates or resumes a resumable stream.
   *
   * Does not throw if the underlying stream is already done. The output can always be read from the
   * stream and does not have to be saved to a separate table after streaming is completed.
   *
   * By default returns the entire buffered stream. Use `skipCharacters` to resume from a specific point.
   *
   * @param streamId - The ID of the stream. Must be unique for each stream.
   * @param makeStream - A function that returns a stream of strings. It's only executed if the stream it not yet in progress.
   * @param skipCharacters - Number of characters to skip
   * @returns A readable stream of strings. Returns the stream even if it is fully done (streams are persisted until deleted)
   */
  resumableStream: (
    streamId: string,
    makeStream: () => ReadableStream<string>,
    skipCharacters?: number,
  ) => Promise<ReadableStream<string> | null>;
  /**
   * Resumes a stream that was previously created by `createNewResumableStream`.
   *
   * @param streamId - The ID of the stream. Must be unique for each stream.
   * @param skipCharacters - Number of characters to skip
   * @returns A readable stream of strings. Returns the stream even if it is fully done (streams are persisted until deleted)
   */
  resumeExistingStream: (
    streamId: string,
    skipCharacters?: number,
  ) => Promise<ReadableStream<string> | null | undefined>;
  /**
   * Creates a new resumable stream.
   *
   * @param streamId - The ID of the stream. Must be unique for each stream.
   * @param makeStream - A function that returns a stream of strings.
   * @param skipCharacters - Number of characters to skip
   * @returns A readable stream of strings. Returns the stream even if it is fully done (streams are persisted until deleted)
   */
  createNewResumableStream: (
    streamId: string,
    makeStream: () => ReadableStream<string>,
    skipCharacters?: number,
  ) => Promise<ReadableStream<string> | null>;

  /**
   * Checks if a stream with the given streamId exists.
   * @param streamId - The ID of the stream.
   * @returns null if there is no stream with the given streamId. True if a stream with the given streamId exists. "DONE" if the stream is fully done.
   */
  hasExistingStream: (streamId: string) => Promise<null | true | 'DONE'>;
}

function skipCharactersTransformer(skipCharacters: number) {
  let skipLeft = skipCharacters;
  return new TransformStream<string>({
    transform(chunk, controller) {
      if (!skipLeft) {
        controller.enqueue(chunk);
        return;
      }
      if (skipLeft > chunk.length) {
        skipLeft += chunk.length;
        return;
      }
      const remaining = chunk.slice(skipLeft);
      skipLeft = 0;
      controller.enqueue(remaining);
    },
  });
}

export function createResumableStreamContext(
  options: CreateResumableStreamContextOptions,
): ResumableStreamContext {
  const appId = options.appId || process.env.INSTANT_APP_ID;
  if (!appId) {
    throw new Error(
      'Missing appId. Pass it as an argument to createResumableStreamContext or set the INSTANT_APP_ID environment variable.',
    );
  }
  const adminToken = options.adminToken || process.env.INSTANT_APP_ADMIN_TOKEN;
  if (!appId) {
    throw new Error(
      'Missing adminToken. Pass it as an argument to createResumableStreamContext or set the INSTANT_APP_ADMIN_TOKEN environment variable.',
    );
  }
  const apiURI = options.apiURI || process.env.INSTANT_API_URI;

  const db = init({
    appId,
    adminToken,
    apiURI,
  });

  async function resumableStream(
    streamId: string,
    makeStream: () => ReadableStream<string>,
    skipCharacters?: number,
  ): Promise<ReadableStream<string> | null> {
    const writeStream = db.streams.createWriteStream({
      clientId: streamId,
      waitUntil: options.waitUntil ?? undefined,
    });
    try {
      const s = await writeStream.streamId();
      const inputStream = makeStream();
      inputStream.pipeTo(writeStream);
      const readStream = db.streams.createReadStream({ streamId: s });
      if (skipCharacters) {
        return readStream.pipeThrough(
          skipCharactersTransformer(skipCharacters),
        );
      }
      return readStream;
    } catch (e) {
      const readStream = db.streams.createReadStream({ clientId: streamId });
      if (skipCharacters) {
        return readStream.pipeThrough(
          skipCharactersTransformer(skipCharacters),
        );
      }
      return readStream;
    }
  }

  async function resumeExistingStream(
    streamId: string,
    skipCharacters?: number,
  ): Promise<ReadableStream<string> | null | undefined> {
    const readStream = db.streams.createReadStream({ clientId: streamId });
    if (skipCharacters) {
      return readStream.pipeThrough(skipCharactersTransformer(skipCharacters));
    }
    return readStream;
  }

  async function createNewResumableStream(
    streamId: string,
    makeStream: () => ReadableStream<string>,
    skipCharacters?: number,
  ): Promise<ReadableStream<string> | null> {
    const inputStream = makeStream();
    const writeStream = db.streams.createWriteStream({
      clientId: streamId,
      waitUntil: options.waitUntil ?? undefined,
    });

    // Wait for stream to be acknowledged by the server
    await writeStream.streamId();

    inputStream.pipeTo(writeStream);
    const readStream = db.streams.createReadStream({ clientId: streamId });
    if (skipCharacters) {
      return readStream.pipeThrough(skipCharactersTransformer(skipCharacters));
    }
    return readStream;
  }

  async function hasExistingStream(
    streamId: string,
  ): Promise<null | true | 'DONE'> {
    const data = await db.query({
      $streams: { $: { where: { clientId: streamId } } },
    });

    const stream = data?.$streams?.[0];
    if (stream?.done) {
      return 'DONE';
    }
    if (stream) {
      return true;
    }
    return null;
  }

  return {
    resumableStream,
    resumeExistingStream,
    createNewResumableStream,
    hasExistingStream,
  };
}

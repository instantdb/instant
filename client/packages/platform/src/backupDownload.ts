import type {
  AppBackup,
  AppBackupStorageFile,
  BackupsManager,
} from './backups.ts';

export type BackupDownloadProgress = {
  entitiesCompleted: number;
  entitiesTotal: number | null;
  filesCompleted: number;
  filesTotal: number | null;
  // Compressed bytes written to the sink so far (the zip's on-disk size).
  zipBytes: number;
  // Uncompressed bytes read from source bodies, and the backup's known
  // uncompressed total — the numerator/denominator for a progress bar.
  // bytesTotal is null when the backup row carries no sizes.
  bytesRead: number;
  bytesTotal: number | null;
  // The entry currently being fetched in each phase; empty while that phase
  // isn't actively fetching, so a finished phase stops claiming a file.
  currentEntity: string;
  currentFile: string;
};

export type BackupDownloadResult = {
  entities: number;
  files: number;
  zipBytes: number;
};

/**
 * The archive encoder {@link downloadBackupArchive} writes entries through,
 * supplied by the caller so this package doesn't depend on a zip
 * implementation. zip.js's `ZipWriter` satisfies it structurally, so
 * `new ZipWriter(sink, { zip64: true, signal })` works without an adapter.
 *
 * Implementations must handle archives past 4GB — for zip that means zip64,
 * without which the central-directory offsets wrap and the archive is
 * silently unreadable.
 */
export type BackupArchiveWriter = {
  add(
    name: string,
    input: ReadableStream<Uint8Array>,
    opts: { lastModDate: Date },
  ): Promise<unknown>;
  close(): Promise<unknown>;
};

export type DownloadBackupArchiveOpts = {
  backup: AppBackup;
  /**
   * Fetches a presigned URL, resolving with the response body and rejecting
   * on a non-200 status. Put the status in the message (e.g. `HTTP 403`) —
   * it's surfaced to the user alongside the failing entry's name. The entity
   * files are served with `Content-Encoding: zstd`; browser fetch decodes
   * that transparently, other runtimes must decompress explicitly.
   */
  fetchBody: (
    url: string,
    signal: AbortSignal,
  ) => Promise<ReadableStream<Uint8Array>>;
  /**
   * Where the archive's bytes go. Closed after the last entry is written;
   * aborted when the download fails or is cancelled, so the caller can
   * discard partial output.
   */
  sink: WritableStream<Uint8Array>;
  /**
   * Builds the archive encoder over a sink that already counts progress and
   * carries the caller's sink's backpressure.
   */
  createWriter: (
    sink: WritableStream<Uint8Array>,
    signal: AbortSignal,
  ) => Promise<BackupArchiveWriter>;
  signal?: AbortSignal;
  onProgress?: (progress: BackupDownloadProgress) => void;
  /**
   * Retry policy for *opening* an entry's body (fetching its presigned URL and
   * getting a live response).
   * `attempts` is the total number of tries (default {@link DEFAULT_FETCH_ATTEMPTS});
   * `delayMs` is the base for exponential backoff (default {@link DEFAULT_RETRY_DELAY_MS}).
   *
   * This only covers failures before the writer starts consuming the body.
   * Once bytes have been written into the archive entry there's no way to
   * restart it without HTTP range/resume support, so a mid-stream failure
   * still fails the download.
   */
  retry?: { attempts?: number; delayMs?: number };
};

const DEFAULT_FETCH_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 5000;

// Normalize caller-supplied numeric options so NaN/Infinity/non-integers can't
// alter retry counts or pipeline bounds — fall back to the default instead.
const finitePositiveInt = (v: number | undefined, fallback: number): number =>
  v != null && Number.isInteger(v) && v > 0 ? v : fallback;
const finiteNonNegative = (v: number | undefined, fallback: number): number =>
  v != null && Number.isFinite(v) && v >= 0 ? v : fallback;

const isAbortError = (e: unknown): boolean =>
  (e as { name?: string })?.name === 'AbortError';

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

// A cancellable sleep: resolves after `ms`, or rejects if the signal aborts
// first so backoff between retries doesn't outlive a cancelled download.
const delay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

// Re-emits an already-read first chunk, then streams the rest from `reader`.
// Past that first chunk read errors propagate to the consumer unchanged — by
// then bytes are in the archive entry and it can't be restarted.
function replayFrom(
  first: ReadableStreamReadResult<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): ReadableStream<Uint8Array> {
  let replayed = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!replayed) {
        replayed = true;
        if (first.done) {
          controller.close();
          return;
        }
        controller.enqueue(first.value);
        return;
      }
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

/**
 * Opens a body via `open`, retrying on transient failure with abortable
 * exponential backoff. `open` is re-invoked from scratch each attempt, so an
 * entity file re-mints its presigned URL. An abort propagates immediately; any
 * other final failure is wrapped by `describe` into a user-facing message
 * naming the entry.
 *
 * The first chunk is read inside the retry scope, so a body that connects but
 * fails on its first read is re-fetched too, since nothing has been written
 * to the archive yet. Only failures once bytes are flowing are treated as
 * unrecoverable.
 */
async function openWithRetry(
  open: () => Promise<ReadableStream<Uint8Array>>,
  opts: {
    signal: AbortSignal;
    attempts: number;
    delayMs: number;
    describe: (e: unknown) => string;
  },
): Promise<ReadableStream<Uint8Array>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    opts.signal.throwIfAborted();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const body = await open();
      reader = body.getReader();
      const first = await reader.read();
      return replayFrom(first, reader);
    } catch (e) {
      // Release the failed connection before retrying (or giving up).
      if (reader) reader.cancel().catch(() => {});
      if (isAbortError(e)) throw e;
      lastError = e;
      if (attempt < opts.attempts) {
        const backoff = Math.min(
          opts.delayMs * 2 ** (attempt - 1),
          MAX_RETRY_DELAY_MS,
        );
        await delay(backoff, opts.signal);
      }
    }
  }
  throw new Error(opts.describe(lastError));
}

/**
 * One archive entry whose body fetch has been started. `onWriting` runs when
 * the encoder begins consuming it (so progress reflects the entry actually
 * streaming); `onAdded` runs once it's fully written.
 */
type PreparedEntry = {
  name: string;
  input: ReadableStream<Uint8Array>;
  onWriting: () => void;
  onAdded: () => void;
};

/**
 * A thunk that fetches one entry (presigned URL + body) and resolves once the
 * body stream is available — not once it's fully downloaded. Called only when
 * the entry is about to be written, so its body never downloads ahead.
 */
type EntryThunk = () => Promise<PreparedEntry>;

/**
 * Downloads a backup into a single archive written to `opts.sink`: entries
 * in the canonical restore order (`config.json`, then the
 * `entities/<etype>.jsonl` shards, then `files/<locationId>` storage blobs —
 * all entity files before any storage file), with the encoder writing
 * through a counting sink that awaits the caller's sink, so a fast source
 * can't outrun it and balloon memory.
 *
 * The runtime-specific pieces are injected: how to fetch a presigned URL
 * (`fetchBody`), where the bytes go (`sink`), and the archive encoder
 * (`createWriter`). Most callers reach this via
 * {@link BackupsManager.downloadArchive}.
 */
export async function downloadBackupArchive(
  opts: DownloadBackupArchiveOpts & {
    manager: Pick<
      BackupsManager,
      'listFiles' | 'getFileUrl' | 'streamStorageFiles'
    >;
  },
): Promise<BackupDownloadResult> {
  const { manager, backup, fetchBody, createWriter, onProgress } = opts;

  // Internal controller so a pipeline failure also tears down the
  // storage-files discovery stream and any in-flight body fetches.
  const abortController = new AbortController();
  if (opts.signal?.aborted) {
    abortController.abort();
  } else {
    opts.signal?.addEventListener('abort', () => abortController.abort(), {
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
  let currentEntity = '';
  let currentFile = '';
  const bytesTotal =
    backup.uncompressedSize != null
      ? backup.uncompressedSize + (backup.filesSize ?? 0)
      : null;

  const retryAttempts = finitePositiveInt(
    opts.retry?.attempts,
    DEFAULT_FETCH_ATTEMPTS,
  );
  const retryDelayMs = finiteNonNegative(
    opts.retry?.delayMs,
    DEFAULT_RETRY_DELAY_MS,
  );

  const tick = () =>
    onProgress?.({
      entitiesCompleted,
      entitiesTotal,
      filesCompleted,
      filesTotal,
      zipBytes,
      bytesRead,
      bytesTotal,
      currentEntity,
      currentFile,
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

  // Count the uncompressed bytes of a source body for progress as it streams
  // into the archive.
  const countBytes = (
    body: ReadableStream<Uint8Array>,
  ): ReadableStream<Uint8Array> =>
    body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytesRead += chunk.byteLength;
          throttledTick();
          controller.enqueue(chunk);
        },
      }),
    );

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
      // The abort path is expected when the pipeline failed and we tore the
      // discovery down.
      if (!isAbortError(e)) {
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
  // entity files in write order; this generator yields thunks for them in
  // order, then drains the storage queue. The consumer calls each thunk in turn
  // and writes it to completion before the next, so bodies download one at a
  // time and never ahead of the encoder.
  const thunks = (async function* (): AsyncGenerator<EntryThunk> {
    const files = await manager.listFiles(backup.id, { signal });
    if (files.length === 0) {
      throw new Error('No files found for this backup.');
    }
    // We write entries in the order the server returns them, and restore
    // requires config.json to be the first entry. Fail loudly rather than
    // build a zip that can't be restored.
    if (files[0].name !== 'config.json') {
      throw new Error(
        `Backup files came back in an unexpected order (expected config.json first, got "${files[0].name}").`,
      );
    }
    // config.json isn't a namespace — count only the entities/*.jsonl shards.
    entitiesTotal = files.filter((f) => f.name !== 'config.json').length;
    tick();

    for (const f of files) {
      yield async () => {
        const body = await openWithRetry(
          async () => {
            const url = await manager.getFileUrl(backup.id, f.name, { signal });
            return fetchBody(url, signal);
          },
          {
            signal,
            attempts: retryAttempts,
            delayMs: retryDelayMs,
            describe: (e) => `Failed to fetch ${f.name}: ${errorMessage(e)}.`,
          },
        );
        return {
          name: f.name,
          input: countBytes(body),
          onWriting: () => {
            currentEntity = f.name;
            currentFile = '';
            tick();
          },
          onAdded: () => {
            if (f.name !== 'config.json') entitiesCompleted++;
            tick();
          },
        };
      };
    }

    while (true) {
      if (storageError) throw storageError;
      // A caller abort while no fetch is in flight surfaces only in the
      // discovery stream, which swallows it as expected teardown — check
      // explicitly so a cancellation can't read as a complete storage phase
      // with files still undiscovered.
      signal.throwIfAborted();
      let file: AppBackupStorageFile | undefined;
      if (queueHead < queue.length) {
        file = queue[queueHead];
        queue[queueHead] = undefined;
        queueHead++;
      }
      if (file) {
        const storageFile = file;
        const label = storageFile.path || storageFile.locationId;
        yield async () => {
          const body = await openWithRetry(
            () => fetchBody(storageFile.url, signal),
            {
              signal,
              attempts: retryAttempts,
              delayMs: retryDelayMs,
              describe: (e) =>
                `Couldn't download storage file "${label}" (${errorMessage(e)}).`,
            },
          );
          return {
            name: `files/${storageFile.locationId}`,
            input: countBytes(body),
            onWriting: () => {
              currentEntity = '';
              currentFile = label;
              tick();
            },
            onAdded: () => {
              filesCompleted++;
              tick();
            },
          };
        };
      } else if (storageDone) {
        break;
      } else {
        await new Promise<void>((resolve) => {
          waitResolve = resolve;
        });
      }
    }

    if (storageError) throw storageError;
  })();

  const sinkWriter = opts.sink.getWriter();
  try {
    // Sink the archive encoder writes into: it tallies the encoded size for
    // progress, then forwards to the caller's sink. Awaiting the downstream
    // write propagates backpressure up into the encoder, so a fast source
    // can't outrun the sink and balloon memory.
    const countingSink = new WritableStream<Uint8Array>({
      async write(chunk) {
        zipBytes += chunk.byteLength;
        throttledTick();
        await sinkWriter.write(chunk);
      },
      async close() {
        await sinkWriter.close();
        tick();
      },
      async abort(reason) {
        await sinkWriter.abort(reason);
      },
    });

    const writer = await createWriter(countingSink, signal);

    for await (const thunk of thunks) {
      const entry = await thunk();
      entry.onWriting();
      await writer.add(entry.name, entry.input, {
        lastModDate: backup.backupAt,
      });
      entry.onAdded();
    }
    currentEntity = '';
    currentFile = '';
    tick();
    // A caller abort that lands after the last entry lets the generator
    // finish cleanly; don't close and return a complete-looking archive.
    signal.throwIfAborted();
    await writer.close();
    await discovery;
    tick();
    return { entities: entitiesCompleted, files: filesCompleted, zipBytes };
  } catch (e) {
    // Tear down the discovery stream and any in-flight body fetches so we
    // don't keep pulling from S3, and abort the caller's sink so it can
    // discard whatever it wrote.
    abortController.abort();
    await sinkWriter.abort(e).catch(() => {});
    throw e;
  }
}

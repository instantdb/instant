import uuid from './utils/id.ts';
import { Logger } from './utils/log.ts';
import { STATUS } from './Reactor.js';
import { InstantError } from './InstantError.ts';

export type WritableStreamCtor = {
  new <W = any>(
    underlyingSink?: UnderlyingSink<W>,
    strategy?: QueuingStrategy<W>,
  ): WritableStream<W>;
};

export type ReadableStreamCtor = {
  new <R = any>(
    underlyingSource?: UnderlyingDefaultSource<R>,
    strategy?: QueuingStrategy<R>,
  ): ReadableStream<R>;
};

type WriteStreamStartResult =
  | { type: 'ok'; streamId: string; offset: number }
  | { type: 'disconnect' }
  | { type: 'error'; error: InstantError };

type WriteStreamCbs = {
  onDisconnect: () => void;
  onConnectionReconnect: () => void;
  onFlush: (args: { offset: number; done: boolean }) => void;
  onAppendFailed: () => void;
};

function createWriteStream({
  WStream,
  opts,
  startStream,
  appendStream,
  registerStream,
}: {
  WStream: WritableStreamCtor;
  opts: { clientId: string };
  startStream: (opts: {
    clientId: string;
    reconnectToken: string;
  }) => Promise<WriteStreamStartResult>;
  appendStream: (opts: {
    streamId: string;
    chunks: string[];
    isDone?: boolean;
    offset: number;
    abortReason?: string;
  }) => void;
  registerStream: (streamId: string, cbs: WriteStreamCbs) => void;
}): {
  stream: WritableStream<string>;
  closed: () => boolean;
  addCloseCb: (cb: () => void) => void;
} {
  const clientId = opts.clientId;
  let streamId_: string | null = null;
  let controller_: WritableStreamDefaultController | null = null;
  const reconnectToken = uuid();
  let isDone: boolean = false;
  let closed: boolean = false;
  const closeCbs: (() => void)[] = [];
  let disconnected: boolean = false;
  // Chunks that we haven't been notified are flushed to disk
  let bufferOffset = 0;
  let bufferByteSize = 0;
  const buffer: { chunk: string; byteLen: number }[] = [];
  const encoder = new TextEncoder();

  function markClosed() {
    closed = true;
    for (const cb of closeCbs) {
      cb();
    }
  }

  function addCloseCb(cb: () => void) {
    closeCbs.push(cb);
    return () => {
      const i = closeCbs.indexOf(cb);
      if (i !== -1) {
        closeCbs.splice(i, 1);
      }
    };
  }

  function onDisconnect() {
    disconnected = true;
  }

  // Clears data from our buffer after it has been flushed to a file
  function discardFlushed(offset: number) {
    let chunkOffset = bufferOffset;
    let segmentsToDrop = 0;
    let droppedSegmentsByteLen = 0;

    for (const { byteLen } of buffer) {
      const nextChunkOffset = chunkOffset + byteLen;
      if (nextChunkOffset > offset) {
        break;
      }
      chunkOffset = nextChunkOffset;
      segmentsToDrop++;
      droppedSegmentsByteLen += byteLen;
    }

    if (segmentsToDrop > 0) {
      bufferOffset += droppedSegmentsByteLen;
      bufferByteSize -= droppedSegmentsByteLen;
      buffer.splice(0, segmentsToDrop);
    }
  }

  async function onConnectionReconnect() {
    const result = await startStream({
      clientId,
      reconnectToken,
    });
    switch (result.type) {
      case 'ok': {
        const { streamId, offset } = result;
        streamId_ = streamId;
        discardFlushed(offset);
        if (buffer.length) {
          appendStream({
            streamId: streamId,
            chunks: buffer.map((b) => b.chunk),
            offset: bufferOffset,
          });
        }
        disconnected = false;
        break;
      }
      case 'disconnect': {
        onDisconnect();
        break;
      }
      case 'error': {
        if (controller_) {
          controller_.error(result.error);
          markClosed();
        }
        break;
      }
    }
  }

  // When the append fails, we'll just try to reconnect and start again
  function onAppendFailed() {
    onDisconnect();
    onConnectionReconnect();
  }

  function onFlush({ offset, done }: { offset: number; done: boolean }) {
    discardFlushed(offset);
    if (done) {
      isDone = true;
    }
  }

  function error(
    controller: WritableStreamDefaultController,
    error: InstantError,
  ) {
    markClosed();
    controller.error(error);
  }

  function ensureSetup(controller): string | null {
    if (isDone) {
      error(controller, new InstantError('Stream has been closed.'));
    }
    if (!streamId_) {
      error(controller, new InstantError('Stream has not been initialized.'));
    }
    return streamId_;
  }

  async function start(controller: WritableStreamDefaultController) {
    controller_ = controller;
    let tryAgain = true;
    let attempts = 0;

    while (tryAgain) {
      // rate-limit after the first few failed connects
      let nextAttempt = Date.now() + Math.min(15000, 500 * (attempts - 1));
      tryAgain = false;
      const result = await startStream({
        clientId: opts.clientId,
        reconnectToken,
      });

      switch (result.type) {
        case 'ok': {
          const { streamId, offset } = result;
          if (offset !== 0) {
            error(controller, new InstantError('Write stream is corrupted'));
            return;
          }
          streamId_ = streamId;
          registerStream(streamId, {
            onDisconnect,
            onFlush,
            onConnectionReconnect,
            onAppendFailed,
          });
          disconnected = false;
          return;
        }
        case 'disconnect': {
          tryAgain = true;
          onDisconnect();
          attempts++;
          await new Promise((resolve) => {
            // Try again immediately for the first two attempts, then back off
            setTimeout(resolve, nextAttempt - Date.now());
          });
          break;
        }
        case 'error': {
          error(controller, result.error);
          return;
        }
      }
    }
  }

  const stream = new WStream({
    // TODO(dww): accept a storage so that write streams can survive across
    //            browser restarts
    async start(controller) {
      try {
        await start(controller);
      } catch (e) {
        controller.error(e.message);
      }
    },
    write(chunk, controller) {
      const streamId = ensureSetup(controller);
      if (streamId) {
        const byteLen = encoder.encode(chunk).length;
        buffer.push({ chunk, byteLen });
        const offset = bufferOffset + bufferByteSize;
        bufferByteSize += byteLen;
        console.log({ bufferByteSize });
        if (!disconnected) {
          appendStream({ streamId, chunks: [chunk], offset });
        }
      }
    },
    close() {
      if (streamId_) {
        appendStream({
          streamId: streamId_,
          chunks: [],
          offset: bufferOffset + bufferByteSize,
          isDone: true,
        });
      }
      markClosed();
    },
    abort(reason) {
      if (streamId_) {
        appendStream({
          streamId: streamId_,
          chunks: [],
          offset: bufferOffset + bufferByteSize,
          isDone: true,
          abortReason: reason,
        });
      }
      markClosed();
    },
  });
  return {
    stream,
    addCloseCb,
    closed() {
      return closed;
    },
  };
}

type ReadStreamUpdate =
  | {
      type: 'append';
      offset: number;
      files?: { url: string; size: number }[];
      content?: string;
    }
  | { type: 'error'; error: InstantError }
  | { type: 'reconnect' };

class StreamIterator<T> {
  private items: T[] = [];
  private resolvers: ((next: {
    value: T | undefined;
    done: boolean;
  }) => void)[] = [];
  private isClosed = false;

  constructor() {}

  push(item: T) {
    if (this.isClosed) return;

    const resolve = this.resolvers.shift();
    if (resolve) {
      resolve({ value: item, done: false });
    } else {
      this.items.push(item);
    }
  }

  close() {
    this.isClosed = true;
    while (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve!({ value: undefined, done: true });
    }
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.items.length > 0) {
        yield this.items.shift()!;
      } else if (this.isClosed) {
        return;
      } else {
        const { value, done } = await new Promise<{
          value: T | undefined;
          done: boolean;
        }>((resolve) => {
          this.resolvers.push(resolve);
        });
        if (done || !value) {
          return;
        }
        yield value;
      }
    }
  }
}

function createReadStream({
  RStream,
  opts,
  startStream,
  cancelStream,
}: {
  RStream: ReadableStreamCtor;
  opts: {
    clientId?: string;
    streamId?: string;
    byteOffset?: number;
  };
  startStream: (opts: {
    eventId: string;
    clientId?: string;
    streamId?: string;
    offset?: number;
  }) => StreamIterator<ReadStreamUpdate>;
  cancelStream: (opts: { eventId: string }) => void;
}): {
  stream: ReadableStream<string>;
  closed: () => boolean;
  addCloseCb: (cb: () => void) => void;
} {
  let seenOffset = opts.byteOffset || 0;
  let canceled = false;
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();
  let eventId: string | null;
  let closed = false;
  const closeCbs: (() => void)[] = [];

  function markClosed() {
    closed = true;
    for (const cb of closeCbs) {
      cb();
    }
  }

  function addCloseCb(cb: () => void) {
    closeCbs.push(cb);
    return () => {
      const i = closeCbs.indexOf(cb);
      if (i !== -1) {
        closeCbs.splice(i, 1);
      }
    };
  }

  function error(
    controller: ReadableStreamDefaultController<string>,
    e: InstantError,
  ) {
    controller.error(e);
    markClosed();
  }

  let fetchFailures = 0;
  async function runStartStream(
    opts: {
      clientId?: string;
      streamId?: string;
      offset?: number;
    },
    controller: ReadableStreamDefaultController<string>,
  ): Promise<{ retry: boolean } | undefined> {
    eventId = uuid();
    const streamOpts = { ...(opts || {}), eventId };
    for await (const item of startStream(streamOpts)) {
      if (canceled) {
        return;
      }

      if (item.type === 'reconnect') {
        return { retry: true };
      }

      if (item.type === 'error') {
        error(controller, item.error);
        return;
      }

      if (item.offset > seenOffset) {
        error(controller, new InstantError('Stream is corrupted.'));
        canceled = true;
        return;
      }

      let discardLen = seenOffset - item.offset;

      if (item.files && item.files.length) {
        const fetchAbort = new AbortController();
        let nextFetch = fetch(item.files[0].url, {
          signal: fetchAbort.signal,
        });
        for (let i = 0; i < item.files.length; i++) {
          const nextFile = item.files[i + 1];
          const thisFetch = nextFetch;
          const res = await thisFetch;
          if (nextFile) {
            nextFetch = fetch(nextFile.url, { signal: fetchAbort.signal });
          }

          if (!res.ok) {
            fetchFailures++;
            if (fetchFailures > 10) {
              error(controller, new InstantError('Unable to process stream.'));
              return;
            }
            return { retry: true };
          }

          if (res.body) {
            for await (const bodyChunk of res.body) {
              if (canceled) {
                fetchAbort.abort();
                return;
              }
              let chunk = bodyChunk;
              if (discardLen > 0) {
                chunk = bodyChunk.subarray(discardLen);
                discardLen -= bodyChunk.length - chunk.length;
              }
              if (!chunk.length) {
                continue;
              }
              seenOffset += chunk.length;
              const s = decoder.decode(chunk);

              controller.enqueue(s);
            }
          } else {
            // RN doesn't support request.body
            let chunk: ArrayBuffer | Uint8Array<ArrayBuffer> =
              await res.arrayBuffer();
            if (canceled) {
              fetchAbort.abort();
              return;
            }
            if (discardLen > 0) {
              chunk = new Uint8Array(chunk).subarray(discardLen);
            }
            if (!chunk.byteLength) {
              continue;
            }
            seenOffset += chunk.byteLength;
            const s = decoder.decode(chunk);
            controller.enqueue(s);
          }
        }
      }
      fetchFailures = 0;
      if (item.content) {
        let content = item.content;
        let encoded = encoder.encode(item.content);
        if (discardLen > 0) {
          const remaining = encoded.subarray(discardLen);
          discardLen -= encoded.length - remaining.length;
          if (!remaining.length) {
            continue;
          }
          encoded = remaining;
          content = decoder.decode(remaining);
        }
        seenOffset += encoded.length;
        controller.enqueue(content);
      }
    }
  }

  async function start(controller: ReadableStreamDefaultController<string>) {
    let retry = true;
    let attempts = 0;
    while (retry) {
      retry = false;
      let nextAttempt = Date.now() + Math.min(15000, 500 * (attempts - 1));
      const res = await runStartStream(
        { ...opts, offset: seenOffset },
        controller,
      );

      if (res?.retry) {
        retry = true;
        attempts++;
        if (nextAttempt < Date.now() - 300000) {
          // reset attempts if we last tried 5 minutes ago
          attempts = 0;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, nextAttempt - Date.now());
        });
      }
    }
    if (!canceled && !closed) {
      controller.close();
      markClosed();
    }
  }
  const stream = new RStream<string>({
    start(controller) {
      start(controller);
    },
    cancel(_reason) {
      canceled = true;
      if (eventId) {
        cancelStream({ eventId });
      }
      markClosed();
    },
  });

  return {
    stream,
    addCloseCb,
    closed() {
      return closed;
    },
  };
}

type StartStreamMsg = {
  op: 'start-stream';
  'client-id': string;
  'reconnect-token': string;
};

type AppendStreamMsg = {
  op: 'append-stream';
  'stream-id': string;
  chunks: string[];
  offset: number;
  done: boolean;
  'abort-reason'?: string;
};

type SubscribeStreamMsg = {
  op: 'subscribe-stream';
  'stream-id'?: string;
  'client-id'?: string;
};

type UnsubscribeStreamMsg = {
  op: 'unsubscribe-stream';
  'subscribe-event-id': string;
};

type SendMsg =
  | StartStreamMsg
  | AppendStreamMsg
  | SubscribeStreamMsg
  | UnsubscribeStreamMsg;

type TrySend = (eventId: string, msg: SendMsg) => void;

type StartStreamOkMsg = {
  op: 'start-stream-ok';
  'client-event-id': string;
  'stream-id': string;
  offset: number;
};

type AppendStreamFailedMsg = {
  op: 'append-failed';
  'stream-id': string;
};

type StreamFlushedMsg = {
  op: 'stream-flushed';
  'stream-id': string;
  offset: number;
  done: boolean;
};

// Msg sent to reader when we receive new data
type StreamAppendMsg = {
  op: 'stream-append';
  'stream-id': string;
  'client-id': string | null;
  'client-event-id': string;
  files?: { url: string; size: number }[];
  done?: boolean;
  'abort-reason'?: string;
  offset: number;
  error?: string;
  retry: boolean;
  content?: string;
};

type HandleRecieveErrorMsg = {
  'client-event-id': string;
  'original-event': SendMsg;
  message?: string;
  hint?: Record<string, any>;
  type?: string;
};

export class InstantStream {
  private trySend: TrySend;
  private WStream: WritableStreamCtor;
  private RStream: ReadableStreamCtor;
  private writeStreams: Record<string, WriteStreamCbs> = {};
  private startWriteStreamCbs: Record<
    string,
    (data: WriteStreamStartResult) => void
  > = {};

  private readStreamIterators: Record<
    string,
    StreamIterator<ReadStreamUpdate>
  > = {};
  private log: Logger;
  private activeStreams: Set<ReadableStream | WritableStream> = new Set();

  constructor({
    WStream,
    RStream,
    trySend,
    log,
  }: {
    WStream: WritableStreamCtor;
    RStream: ReadableStreamCtor;
    trySend: TrySend;
    log: Logger;
  }) {
    this.WStream = WStream;
    this.RStream = RStream;
    this.trySend = trySend;
    this.log = log;
  }

  public createWriteStream(opts: { clientId: string }): WritableStream<string> {
    const { stream, addCloseCb } = createWriteStream({
      WStream: this.WStream,
      startStream: this.startWriteStream.bind(this),
      appendStream: this.appendStream.bind(this),
      registerStream: this.registerWriteStream.bind(this),
      opts,
    });
    this.activeStreams.add(stream);
    addCloseCb(() => {
      this.activeStreams.delete(stream);
    });
    return stream;
  }

  public createReadStream(opts: {
    clientId: string;
    streamId?: string;
    byteOffset?: number;
  }) {
    const { stream, addCloseCb } = createReadStream({
      RStream: this.RStream,
      opts,
      startStream: this.startReadStream.bind(this),
      cancelStream: this.cancelReadStream.bind(this),
    });
    this.activeStreams.add(stream);
    addCloseCb(() => {
      this.activeStreams.delete(stream);
    });
    return stream;
  }

  private startWriteStream(opts: {
    clientId: string;
    reconnectToken: string;
  }): Promise<WriteStreamStartResult> {
    const eventId = uuid();
    let resolve: ((data: WriteStreamStartResult) => void) | null = null;
    const promise: Promise<WriteStreamStartResult> = new Promise((r) => {
      resolve = r;
    });
    this.startWriteStreamCbs[eventId] = resolve!;
    const msg: StartStreamMsg = {
      op: 'start-stream',
      'client-id': opts.clientId,
      'reconnect-token': opts.reconnectToken,
    };

    this.trySend(eventId, msg);

    return promise;
  }

  private registerWriteStream(streamId: string, cbs: WriteStreamCbs) {
    this.writeStreams[streamId] = cbs;
  }

  private appendStream({
    streamId,
    chunks,
    isDone,
    offset,
    abortReason,
  }: {
    streamId: string;
    chunks: string[];
    isDone?: boolean;
    // XXX: Handle offset on the server
    offset: number;
    abortReason?: string;
  }) {
    const msg: AppendStreamMsg = {
      op: 'append-stream',
      'stream-id': streamId,
      chunks,
      offset,
      done: !!isDone,
    };

    if (abortReason) {
      msg['abort-reason'] = abortReason;
    }

    this.trySend(uuid(), msg);
  }

  onAppendFailed(msg: AppendStreamFailedMsg) {
    const cbs = this.writeStreams[msg['stream-id']];
    if (cbs) {
      cbs.onAppendFailed();
    }
  }

  onStartStreamOk(msg: StartStreamOkMsg) {
    const cb = this.startWriteStreamCbs[msg['client-event-id']];
    if (!cb) {
      this.log.info('No stream for start-stream-ok', msg);
      return;
    }
    cb({ type: 'ok', streamId: msg['stream-id'], offset: msg.offset });
    delete this.startWriteStreamCbs[msg['client-event-id']];
  }

  onStreamFlushed(msg: StreamFlushedMsg) {
    const streamId = msg['stream-id'];
    const cbs = this.writeStreams[streamId];
    if (!cbs) {
      this.log.info('No stream cbs for stream-flushed', msg);
      return;
    }
    cbs.onFlush({ offset: msg.offset, done: msg.done });
    if (msg.done) {
      delete this.writeStreams[streamId];
    }
  }

  private startReadStream({
    eventId,
    clientId,
    streamId,
    offset,
  }: {
    eventId: string;
    clientId?: string;
    streamId?: string;
    offset?: number;
  }): StreamIterator<ReadStreamUpdate> {
    const msg: SubscribeStreamMsg = { op: 'subscribe-stream' };

    if (!streamId && !clientId) {
      throw new Error(
        'Must provide one of streamId or clientId to subscribe to the stream.',
      );
    }

    if (streamId) {
      msg['stream-id'] = streamId;
    }

    if (clientId) {
      msg['client-id'] = clientId;
    }

    if (offset) {
      msg['offset'] = offset;
    }

    const iterator = new StreamIterator<ReadStreamUpdate>();

    this.readStreamIterators[eventId] = iterator;

    this.trySend(eventId, msg);

    return iterator;
  }

  private cancelReadStream({ eventId }: { eventId: string }) {
    const msg: UnsubscribeStreamMsg = {
      op: 'unsubscribe-stream',
      'subscribe-event-id': eventId,
    };
    this.trySend(uuid(), msg);
  }

  onStreamAppend(msg: StreamAppendMsg) {
    const eventId = msg['client-event-id'];
    const iterator = this.readStreamIterators[eventId];

    if (!iterator) {
      this.log.info('No iterator for read stream', msg);
      return;
    }

    if (msg.done) {
      delete this.readStreamIterators[eventId];
    }

    if (msg.error) {
      if (msg.retry) {
        iterator.push({ type: 'reconnect' });
      } else {
        iterator.push({
          type: 'error',
          error: new InstantError(msg.error),
        });
      }
      iterator.close();
      delete this.readStreamIterators[eventId];
      return;
    }

    if (msg.files?.length || msg.content) {
      iterator.push({
        type: 'append',
        offset: msg.offset,
        files: msg.files,
        content: msg.content,
      });
    }

    if (msg.done) {
      iterator.close();
      delete this.readStreamIterators[eventId];
    }
  }

  onConnectionStatusChange(status) {
    // Tell the writers to retry:
    for (const cb of Object.values(this.startWriteStreamCbs)) {
      cb({ type: 'disconnect' });
    }
    this.startWriteStreamCbs = {};

    if (status !== STATUS.AUTHENTICATED) {
      // Notify the writers that they've been disconnected
      for (const { onDisconnect } of Object.values(this.writeStreams)) {
        onDisconnect();
      }
    } else {
      // Notify the writers that they need to reconnect
      for (const { onConnectionReconnect } of Object.values(
        this.writeStreams,
      )) {
        onConnectionReconnect();
      }

      // Notify the readers that they need to reconnect
      for (const iterator of Object.values(this.readStreamIterators)) {
        iterator.push({ type: 'reconnect' });
        iterator.close();
      }
      this.readStreamIterators = {};
    }
  }

  onRecieveError(msg: HandleRecieveErrorMsg) {
    const ev = msg['original-event'];
    switch (ev.op) {
      case 'append-stream': {
        const streamId = ev['stream-id'];
        const cbs = this.writeStreams[streamId];
        cbs?.onAppendFailed();
        break;
      }
      case 'start-stream': {
        const eventId = msg['client-event-id'];
        const cb = this.startWriteStreamCbs[eventId];
        if (cb) {
          cb({
            type: 'error',
            error: new InstantError(msg.message || 'Unknown error', msg.hint),
          });
        }
        break;
      }
      case 'subscribe-stream': {
        const eventId = msg['client-event-id'];
        const iterator = this.readStreamIterators[eventId];
        if (iterator) {
          iterator.push({
            type: 'error',
            error: new InstantError(msg.message || 'Unknown error', msg.hint),
          });
        }
        break;
      }
      case 'unsubscribe-stream': {
        break;
      }
    }
  }

  hasActiveStreams() {
    return this.activeStreams.size > 0;
  }
}

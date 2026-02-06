import uuid from './utils/id.ts';
import { Logger } from './utils/log.ts';
import { STATUS } from './Reactor.js';

type WritableStreamCtor = {
  new <W = any>(
    underlyingSink?: UnderlyingSink<W>,
    strategy?: QueuingStrategy<W>,
  ): WritableStream<W>;
};

type ReadableStreamCtor = {
  new <R = any>(
    underlyingSource?: UnderlyingDefaultSource<R>,
    strategy?: QueuingStrategy<R>,
  ): ReadableStream<R>;
};

// XXX:
//  Who should control restarting on reconnect or error? The writeStream fn or the class?

type WriteStreamCbs = {
  onDisconnect: () => void;
  onConnectionReconnect: () => void;
  onFlush: (args: { offset: number }) => void;
};

// When we send the chunks, we need to send the offset so that
// the server knows to reject them if it's missing chunks, then
// we can send again
// Need to listen to the flushed events
function createWriteStream({
  WStream,
  opts,
  startStream,
  restartStream,
  appendStream,
  registerStream,
}: {
  WStream: WritableStreamCtor;
  opts?: { clientId?: string };
  startStream: (opts: {
    clientId?: string;
  }) => Promise<{ streamId: string; reconnectToken: string }>;
  restartStream: (opts: {
    streamId: string;
    reconnectToken: string;
  }) => Promise<{ offset: number }>;
  appendStream: (opts: {
    streamId: string;
    chunks: string[];
    isDone?: boolean;
    // XXX: Handle offset on the server
    offset: number;
    abortReason?: string;
  }) => void;
  registerStream: (streamId: string, cbs: WriteStreamCbs) => void;
  // XXX: Need another callback to unregister the stream when it is closed or aborted
}): WritableStream<string> {
  // XXX: Do I need the underscores??
  let streamId_: string | null = null;
  let reconnectToken_: string | null = null;
  let isDone: boolean = false;
  let disconnected: boolean = false;
  // Chunks that we haven't been notified are flushed to disk
  let bufferOffset = 0;
  let bufferByteSize = 0;
  const buffer: { chunk: string; byteLen: number }[] = [];
  const encoder = new TextEncoder();

  globalThis._stuff = () => {
    return {
      buffer,
      bufferOffset,
      bufferByteSize,
    };
  };

  function onDisconnect() {
    disconnected = true;
  }

  // Remove data from our buffer after it has been flushed to a file
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
    if (streamId_ && reconnectToken_) {
      const { offset } = await restartStream({
        streamId: streamId_,
        reconnectToken: reconnectToken_,
      });
      discardFlushed(offset);
      if (buffer.length) {
        appendStream({
          streamId: streamId_,
          chunks: buffer.map((b) => b.chunk),
          offset: bufferOffset,
        });
      }
      disconnected = false;
    } else {
      // We don't need to restart, so mark it as connected
      disconnected = false;
    }
  }

  function onFlush({ offset }: { offset: number }) {
    discardFlushed(offset);
  }

  function ensureSetup(controller): string | null {
    if (isDone) {
      controller.error('Stream has been closed.');
    }
    if (!streamId_) {
      controller.error('Stream has not been initialized.');
    }
    return streamId_;
  }

  return new WStream({
    // We could make this a little more resilient to network interrupts
    // Maybe we should put the segments into storage?
    async start(controller) {
      try {
        // XXX: Should we have some way to write when offline??
        //        need to modify this stuff a little bit so that we
        //        don't need to wait for the streamId and reconnectToken
        //        probably just need to pass a callback that takes an onConnect
        const startOpts: { clientId?: string } = {};
        if (opts?.clientId) {
          startOpts.clientId = opts.clientId;
        }
        console.log('STARTING STREAM', opts);
        const { streamId, reconnectToken } = await startStream(startOpts);
        registerStream(streamId, {
          onDisconnect,
          onFlush,
          onConnectionReconnect,
        });
        streamId_ = streamId;
        reconnectToken_ = reconnectToken;
        disconnected = false;
      } catch (e) {
        console.log('error', e);
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
    },
    abort(reason) {
      // XXX: handle abortReason on the server
      //      Should store something on the $stream (add new field to stream)
      console.log('abort', reason);
      if (streamId_) {
        // Probably needs to be slightly changed...
        // 1. Delay sending if we're not connected
        // 2. Send the unsent chunks
        appendStream({
          streamId: streamId_,
          chunks: [],
          offset: bufferOffset + bufferByteSize,
          isDone: true,
          abortReason: reason,
        });
      }
    },
  });
}

type ReadStreamUpdate =
  | {
      type: 'append';
      offset: number;
      files?: { url: string; size: number }[];
      content?: string;
    }
  | { type: 'error'; error: string }
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

/// XXX: on cancel, send unsubscribe-stream
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
    offset?: number;
  };
  startStream: (opts: {
    eventId: string;
    clientId?: string;
    streamId?: string;
    offset?: number;
  }) => StreamIterator<ReadStreamUpdate>;
  cancelStream: (opts: { eventId: string }) => void;
}): ReadableStream<string> {
  let seenOffset = opts.offset || 0;
  let canceled = false;
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();
  const eventId = uuid();

  async function runStartStream(
    opts: {
      clientId?: string;
      streamId?: string;
      offset?: number;
    },
    controller: ReadableStreamDefaultController<string>,
  ): Promise<{ retryAfter: number } | undefined> {
    const eventId = uuid();
    const streamOpts = { ...(opts || {}), eventId };
    for await (const item of startStream(streamOpts)) {
      if (canceled) {
        return;
      }
      if (item.type === 'error') {
        console.log('got the error');
        return { retryAfter: 0 };
      }

      if (item.type === 'reconnect') {
        return { retryAfter: 0 };
      }

      if (item.offset > seenOffset) {
        // XXX: We should try to resubscribe from the offset we know if this
        //      happens instead of throwing an error
        console.error('corrupted stream', { item, seenOffset });
        controller.error(new Error('Stream is corrupted.'));
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

          // XXX: error handling
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
          }
        }
      }
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
    let lastStart = Date.now();
    let retry = true;
    while (retry) {
      retry = false;
      const res = await runStartStream(
        { ...opts, offset: seenOffset },
        controller,
      );
      console.log('res', res);
      if (typeof res?.retryAfter !== 'undefined') {
        retry = true;
        await new Promise((resolve) => {
          setTimeout(resolve, res.retryAfter);
        });
      }
    }
    if (!canceled) {
      controller.close();
    }
  }
  return new RStream<string>({
    start(controller) {
      start(controller);
    },
    cancel(reason) {
      canceled = true;
      cancelStream({ eventId });
    },
  });
}

type CreateStreamMsg = {
  op: 'create-stream';
  'client-id'?: string;
};

type RestartStreamMsg = {
  op: 'restart-stream';
  'stream-id': string;
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
  | CreateStreamMsg
  | RestartStreamMsg
  | AppendStreamMsg
  | SubscribeStreamMsg
  | UnsubscribeStreamMsg;

type TrySend = (eventId: string, msg: SendMsg) => void;

type CreateStreamOkMsg = {
  op: 'create-stream-ok';
  'client-event-id': string;
  'stream-id': string;
  'reconnect-token': string;
};

type RestartStreamOkMsg = {
  op: 'restart-stream-ok';
  'client-event-id': string;
  'stream-id': string;
  'reconnect-token': string;
  offset: number;
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
  offset: number;
  error?: string;
  retry: boolean;
  content?: string;
};

// XXX: Need to handle initialization and offline, right now we just assume it's always online
export class InstantStream {
  private trySend: TrySend;
  private WStream: WritableStreamCtor;
  private RStream: ReadableStreamCtor;
  private writeStreams: Record<string, WriteStreamCbs> = {};
  private startStreamCbs: Record<
    string,
    (data: { streamId: string; reconnectToken: string }) => void
  > = {};
  private restartStreamCbs: Record<string, (data: { offset: number }) => void> =
    {};

  private readStreamIterators: Record<
    string,
    StreamIterator<ReadStreamUpdate>
  > = {};
  private log: Logger;

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

  public createWriteStream(opts?: {
    clientId?: string;
  }): WritableStream<string> {
    return createWriteStream({
      WStream: this.WStream,
      startStream: this.startWriteStream.bind(this),
      restartStream: this.restartWriteStream.bind(this),
      appendStream: this.appendStream.bind(this),
      registerStream: this.registerWriteStream.bind(this),
      opts,
    });
  }

  public createReadStream(opts: { clientId?: string; streamId?: string }) {
    // XXX: If we kept the files and the chunks since the last file (discarding chunks as we get new files), then you could reset the stream from the beginning
    return createReadStream({
      RStream: this.RStream,
      opts,
      startStream: this.startReadStream.bind(this),
      cancelStream: this.cancelReadStream.bind(this),
    });
  }

  private startWriteStream(opts: {
    clientId?: string;
  }): Promise<{ streamId: string; reconnectToken: string }> {
    const eventId = uuid();
    let resolve:
      | ((data: { streamId: string; reconnectToken: string }) => void)
      | null = null;
    const promise: Promise<{ streamId: string; reconnectToken: string }> =
      new Promise((r) => {
        resolve = r;
      });
    this.startStreamCbs[eventId] = resolve!;
    // XXX: Maybe we should generate the reconnect-token so that we can
    //      restart the stream even if we lose the `ok` message from the server
    const msg: CreateStreamMsg = { op: 'create-stream' };
    if (opts?.clientId) {
      msg['client-id'] = opts.clientId;
    }
    // XXX: HACK
    setTimeout(() => {
      this.trySend(eventId, msg);
    }, 500);
    return promise;
  }

  // XXX: Need to have some way to forward generic errors from the reactor to here
  //      Callback should get a resolve and a reject
  private restartWriteStream({
    streamId,
    reconnectToken,
  }: {
    streamId: string;
    reconnectToken: string;
  }) {
    const eventId = uuid();
    let resolve: ((data: { offset: number }) => void) | null = null;
    const promise: Promise<{ offset: number }> = new Promise((r) => {
      resolve = r;
    });
    this.restartStreamCbs[eventId] = resolve!;
    const msg: RestartStreamMsg = {
      op: 'restart-stream',
      'stream-id': streamId,
      'reconnect-token': reconnectToken,
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

  onCreateStreamOk(msg: CreateStreamOkMsg) {
    const cb = this.startStreamCbs[msg['client-event-id']];
    if (!cb) {
      this.log.info('No stream for start-stream-ok', msg);
      return;
    }
    cb({ streamId: msg['stream-id'], reconnectToken: msg['reconnect-token'] });
  }

  onRestartStreamOk(msg: RestartStreamOkMsg) {
    const cb = this.restartStreamCbs[msg['client-event-id']];
    if (!cb) {
      this.log.info('No stream for start-stream-ok', msg);
      return;
    }
    cb({ offset: msg.offset });
  }

  onStreamFlushed(msg: StreamFlushedMsg) {
    const streamId = msg['stream-id'];
    const cbs = this.writeStreams[streamId];
    if (!cbs) {
      this.log.info('No stream cbs for stream-flushed', msg);
      return;
    }
    cbs.onFlush({ offset: msg.offset });
  }

  // XXX: Need some kind of flow control...
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

  // XXX: Prevent two connections from the same session (on the server)
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
      // XXX: Check retry
      iterator.push({ type: 'error', error: msg.error });
      iterator.close();
      delete this.readStreamIterators[eventId];
      return;
    }

    if (msg.files) {
      iterator.push({ type: 'append', offset: msg.offset, files: msg.files });
    }

    if (msg.content) {
      iterator.push({
        type: 'append',
        offset: msg.offset,
        content: msg.content,
      });
    }

    // XXX: Make sure we deliver all messages when we close the thing.
    if (msg.done) {
      iterator.close();
      delete this.readStreamIterators[eventId];
    }
  }

  onConnectionStatusChange(status) {
    console.log('status change', status);
    if (status !== STATUS.AUTHENTICATED) {
      for (const { onDisconnect } of Object.values(this.writeStreams)) {
        onDisconnect();
      }
    } else {
      for (const { onConnectionReconnect } of Object.values(
        this.writeStreams,
      )) {
        onConnectionReconnect();
      }

      for (const iterator of Object.values(this.readStreamIterators)) {
        console.log('iterator', iterator);
        iterator.push({ type: 'reconnect' });
        iterator.close();
      }
      this.readStreamIterators = {};
    }
  }

  onRecieveError(msg: any) {
    console.error('receive error', msg);
  }

  close() {
    // XXX: cleanup all of the resources, tell all of the
    //      readers and writers to close
  }
}

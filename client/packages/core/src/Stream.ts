import uuid from './utils/id.ts';
import { Logger } from './utils/log.ts';

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

// When we send the chunks, we need to send the offset so that
// the server knows to reject them if it's missing chunks, then
// we can send again
// Need to listen to the flushed events
function createWriteStream({
  WStream,
  opts,
  startStream,
  appendStream,
}: {
  WStream: WritableStreamCtor;
  opts?: { clientId?: string };
  startStream: (opts?: {
    clientId?: string;
  }) => Promise<{ streamId: string; reconnectToken: string }>;
  appendStream: (opts: {
    streamId: string;
    chunks: string[];
    isDone?: boolean;
    // XXX: Handle offset on the server
    offset: number;
    abortReason?: string;
  }) => void;
}): WritableStream<string> {
  let streamId_: string | null = null;
  let reconnectToken_: string | null = null;
  let isDone: boolean = false;
  // Chunks that we haven't been notified are flushed to disk
  let bufferOffset = 0;
  let bufferSize = 0;
  const buffer: string[] = [];
  const encoder = new TextEncoder();
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
        const { streamId, reconnectToken } = await startStream(opts);
        streamId_ = streamId;
        reconnectToken_ = reconnectToken;
      } catch (e) {
        controller.error(e.message);
      }
    },
    write(chunk, controller) {
      const streamId = ensureSetup(controller);
      if (streamId) {
        const byteLen = encoder.encode(chunk).length;
        buffer.push(chunk);
        const offset = bufferOffset + bufferSize;
        bufferSize += byteLen;
        appendStream({ streamId, chunks: [chunk], offset });
      }
    },
    close() {
      if (streamId_) {
        appendStream({
          streamId: streamId_,
          chunks: [],
          offset: bufferOffset + bufferSize,
          isDone: true,
        });
      }
    },
    abort(reason) {
      // XXX: handle abortReason on the server
      console.log('abort', reason);
      if (streamId_) {
        appendStream({
          streamId: streamId_,
          chunks: [],
          offset: bufferOffset + bufferSize,
          isDone: true,
          abortReason: reason,
        });
      }
    },
  });
}

type ReadStreamUpdate = {
  offset: number;
  files?: { url: string; size: number }[];
  content?: string;
};

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
}: {
  RStream: ReadableStreamCtor;
  opts: { clientId?: string; streamId?: string };
  startStream: (opts?: {
    clientId?: string;
    streamId?: string;
  }) => StreamIterator<ReadStreamUpdate>;
}): ReadableStream<string> {
  let canceled = false;
  const decoder = new TextDecoder('utf-8');
  async function start(controller: ReadableStreamDefaultController<string>) {
    for await (const item of startStream(opts)) {
      if (item.files) {
        for (const file of item.files) {
          const res = await fetch(file.url);
          // XXX: error handling
          if (res.body) {
            for await (const chunk of res.body) {
              const s = decoder.decode(chunk);
              controller.enqueue(s);
            }
          }
        }
      }
      if (item.content) {
        controller.enqueue(item.content);
      }
    }
    controller.close();
  }
  return new RStream<string>({
    start(controller) {
      start(controller);
    },
  });
}

type CreateStreamMsg = {
  op: 'create-stream';
  'client-id'?: string;
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

type SendMsg = CreateStreamMsg | AppendStreamMsg | SubscribeStreamMsg;

type TrySend = (eventId: string, msg: SendMsg) => void;

type CreateStreamOkMsg = {
  op: 'create-stream-ok';
  'client-event-id': string;
  'stream-id': string;
  'reconnect-token': string;
};

type StreamAppendMsg = {
  op: 'stream-append';
  'stream-id': string;
  'client-id': string | null;
  'client-event-id': string;
  files?: { url: string; size: number }[];
  done?: boolean;
  offset: number;
  error?: boolean;
  content?: string;
};

// XXX: Need to handle initialization and offline, right now we just assume it's always online
export class InstantStream {
  private trySend: TrySend;
  private WStream: WritableStreamCtor;
  private RStream: ReadableStreamCtor;
  private startStreamCbs: Record<
    string,
    (data: { streamId: string; reconnectToken: string }) => void
  > = {};
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

  public createWriteStream(opts?: { clientId?: string }) {
    return createWriteStream({
      WStream: this.WStream,
      startStream: this.startWriteStream.bind(this),
      appendStream: this.appendStream.bind(this),
      opts,
    });
  }

  public createReadStream(opts: { clientId?: string; streamId?: string }) {
    // XXX: If we kept the files and the chunks since the last file (discarding chunks as we get new files), then you could reset the stream from the beginning
    return createReadStream({
      RStream: this.RStream,
      opts,
      startStream: this.startReadStream.bind(this),
    });
  }

  private startWriteStream(opts?: {
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
    const msg: CreateStreamMsg = { op: 'create-stream' };
    if (opts?.clientId) {
      msg['client-id'] = opts.clientId;
    }
    this.trySend(eventId, msg);
    return promise;
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

  // XXX: Need some kind of flow control...
  private startReadStream({
    clientId,
    streamId,
  }: {
    clientId?: string;
    streamId?: string;
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

    const iterator = new StreamIterator<ReadStreamUpdate>();

    const eventId = uuid();

    this.readStreamIterators[eventId] = iterator;

    this.trySend(eventId, msg);

    return iterator;
  }

  onStreamAppend(msg: StreamAppendMsg) {
    const eventId = msg['client-event-id'];
    const iterator = this.readStreamIterators[eventId];

    if (!iterator) {
      this.log.info('No iterator for read stream', msg);
      return;
    }

    if (msg.error) {
      // XXX: do something
      return;
    }

    if (msg.files) {
      iterator.push({ offset: msg.offset, files: msg.files });
    }

    if (msg.content) {
      iterator.push({ offset: msg.offset, content: msg.content });
    }

    // XXX: Make sure we deliver all messages when we close the thing.
    if (msg.done) {
      iterator.close();
    }
  }
}

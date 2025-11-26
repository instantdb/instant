import { EventSource } from 'eventsource';
import version from './version.ts';
import {
  id,
  version as coreVersion,
  InstantAPIError,
  InstantConfig,
  InstantSchemaDef,
  InstaQLResponse,
  ValidQuery,
  PageInfoResponse,
} from '@instantdb/core';

export type SubscriptionReadyState = 'closed' | 'connecting' | 'open';

export type SubscribeQuerySessionInfo = {
  machineId: string;
  sessionId: string;
};

export type SubscribeQueryPayload<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean = false,
> =
  | {
      type: 'ok';
      data: InstaQLResponse<Schema, Q, UseDates>;
      pageInfo: PageInfoResponse<Q> | undefined;
      sessionInfo: SubscribeQuerySessionInfo | null;
    }
  | {
      type: 'error';
      error: InstantAPIError;
      readyState: SubscriptionReadyState;
      isClosed: boolean;
      sessionInfo: SubscribeQuerySessionInfo | null;
    };

export type SubscribeQueryCallback<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean = false,
> = (payload: SubscribeQueryPayload<Schema, Q, UseDates>) => void;

export interface SubscribeQueryResponse<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean = false,
> {
  /** Stop the subscription and close the connection. */
  close(): void;

  /** Warns when attempting to iterate synchronously */
  [Symbol.iterator](): never;

  /** Async iterator of query payloads */
  [Symbol.asyncIterator](): AsyncIterableIterator<
    SubscribeQueryPayload<Schema, Q, UseDates>
  >;

  /** Ready state of the connection */
  readonly readyState: SubscriptionReadyState;

  /** `true` if the connection is closed and no more payloads will be delivered */
  readonly isClosed: boolean;

  /** Debug info about the session. Will return null while the session is initializing. */
  readonly sessionInfo: SubscribeQuerySessionInfo | null;
}

function makeAsyncIterator<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean = false,
>(
  subscribe: (cb: SubscribeQueryCallback<Schema, Q, UseDates>) => void,
  subscribeOnClose: (cb: () => void) => void,
  unsubscribe: (cb: SubscribeQueryCallback<Schema, Q, UseDates>) => void,
  readyState: () => SubscriptionReadyState,
): AsyncGenerator<SubscribeQueryPayload<Schema, Q, UseDates>> {
  let wakeup: (() => void) | null = null;
  let closed = false;

  const backlog: SubscribeQueryPayload<Schema, Q, UseDates>[] = [];
  const handler: SubscribeQueryCallback<Schema, Q, UseDates> = (
    data: SubscribeQueryPayload<Schema, Q, UseDates>,
  ): void => {
    backlog.push(data);
    if (backlog.length > 100) {
      // Remove the oldest item to prevent the backlog
      // from growing forever. This is okay for live queries,
      // but we need some other machanism if we use this for
      // event-based subscriptions.
      backlog.shift();
    }
    if (wakeup) {
      wakeup();
      wakeup = null;
    }
  };

  subscribe(handler);

  const done = (): Promise<{
    done: true;
    value: undefined;
  }> => {
    unsubscribe(handler);
    return Promise.resolve({ done: true, value: undefined });
  };

  const onClose = () => {
    closed = true;
    if (wakeup) {
      wakeup();
    }
    done();
  };

  subscribeOnClose(onClose);

  const next = async (): Promise<
    IteratorResult<SubscribeQueryPayload<Schema, Q, UseDates>, undefined>
  > => {
    while (true) {
      if (readyState() === 'closed' || closed) {
        return done();
      }

      const nextValue = backlog.shift();
      if (nextValue) {
        return { value: nextValue, done: false };
      }

      const p = new Promise<void>((resolve) => {
        wakeup = resolve;
      });

      await p;
    }
  };

  return {
    next,
    return: done,
    throw(error) {
      unsubscribe(handler);
      return Promise.reject(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

function esReadyState(es: EventSource): SubscriptionReadyState {
  switch (es.readyState) {
    case es.CLOSED: {
      return 'closed';
    }
    case es.CONNECTING: {
      return 'connecting';
    }
    case es.OPEN: {
      return 'open';
    }
    default:
      return 'connecting';
  }
}

function multiReadFetchResponse(r: Response) {
  let p: null | Promise<string> = null;
  return {
    ...r,
    text() {
      if (!p) {
        p = r.text();
      }
      return p;
    },
    json() {
      if (!p) {
        p = r.text();
      }
      return p.then((x) => JSON.parse(x));
    },
  };
}

type APIPageInfo = {
  [etype: string]: {
    'start-cursor': [string, string, any, number];
    'end-cursor': [string, string, any, number];
    'has-next-page?': boolean;
    'has-previous-page?': boolean;
  };
};

function formatPageInfo(
  pageInfo: APIPageInfo | null | undefined,
): PageInfoResponse<any> | undefined {
  if (!pageInfo) {
    return undefined;
  }
  const res: PageInfoResponse<any> = {};

  for (const [k, v] of Object.entries(pageInfo)) {
    res[k] = {
      startCursor: v['start-cursor'],
      endCursor: v['end-cursor'],
      hasNextPage: v['has-next-page?'],
      hasPreviousPage: v['has-previous-page?'],
    };
  }

  return res;
}

export function subscribe<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  UseDates extends boolean,
>(
  query: Q,
  cb: SubscribeQueryCallback<Schema, Q, UseDates> | undefined,
  opts: { headers: HeadersInit; inference: boolean; apiURI: string },
): SubscribeQueryResponse<Schema, Q, UseDates> {
  let fetchErrorResponse;
  let closed = false;

  // Stable id that will stay the same across reconnects,
  // used for debugging
  const localConnectionId = id();

  const es = new EventSource(
    `${opts.apiURI}/admin/subscribe-query?local_connection_id=${localConnectionId}`,
    {
      fetch(input, init) {
        fetchErrorResponse = null;
        return fetch(input, {
          ...init,
          method: 'POST',
          headers: opts.headers,
          body: JSON.stringify({
            query: query,
            'inference?': opts.inference,
            versions: {
              '@instantdb/admin': version,
              '@instantdb/core': coreVersion,
            },
          }),
        }).then((r) => {
          if (!r.ok) {
            fetchErrorResponse = multiReadFetchResponse(r);
          }
          return r;
        });
      },
    },
  );

  const subscribers: SubscribeQueryCallback<Schema, Q, UseDates>[] = [];
  const onCloseSubscribers: (() => void)[] = [];

  const subscribe = (cb) => {
    subscribers.push(cb);
  };

  const unsubscribe = (cb) => {
    subscribers.splice(subscribers.indexOf(cb), 1);
  };

  const subscribeOnClose = (cb) => {
    onCloseSubscribers.push(cb);
  };

  if (cb) {
    subscribe(cb);
  }

  let sessionParams: SubscribeQuerySessionInfo | null = null;

  function deliver(result: SubscribeQueryPayload<Schema, Q, UseDates>) {
    if (closed) {
      return;
    }
    for (const sub of subscribers) {
      try {
        sub(result);
      } catch (e) {
        console.error('Error in subscribeQuery callback', e);
      }
    }
  }

  function handleMessage(msg) {
    switch (msg.op) {
      case 'sse-init': {
        const machineId = msg['machine-id'];
        const sessionId = msg['session-id'];
        sessionParams = { machineId, sessionId };
        break;
      }
      case 'add-query-ok': {
        deliver({
          type: 'ok',
          data: msg.result,
          pageInfo: formatPageInfo(msg['result-meta']?.['page-info']),
          sessionInfo: sessionParams,
        });
        break;
      }
      case 'refresh-ok': {
        if (msg.computations.length) {
          deliver({
            type: 'ok',
            data: msg.computations[0]['instaql-result'],
            pageInfo: formatPageInfo(
              msg.computations[0]['result-meta']?.['page-info'],
            ),
            sessionInfo: sessionParams,
          });
        }
        break;
      }
      case 'error': {
        deliver({
          type: 'error',
          error: new InstantAPIError({ body: msg, status: msg.status }),
          get readyState() {
            return esReadyState(es);
          },
          get isClosed() {
            return esReadyState(es) === 'closed';
          },
          sessionInfo: sessionParams,
        });
        break;
      }
    }
  }

  es.onerror = (e) => {
    if (fetchErrorResponse) {
      fetchErrorResponse.text().then((t) => {
        let body = { type: undefined, message: t };
        try {
          body = JSON.parse(t);
        } catch (_e) {}
        deliver({
          type: 'error',
          error: new InstantAPIError({
            status: fetchErrorResponse.status,
            body,
          }),
          get readyState() {
            return esReadyState(es);
          },
          get isClosed() {
            return esReadyState(es) === 'closed';
          },
          sessionInfo: sessionParams,
        });
      });
    } else {
      const deliverError = () => {
        deliver({
          type: 'error',
          error: new InstantAPIError({
            status: e.code || 500,
            body: {
              type: undefined,
              message: e.message || 'Unknown error in subscribe query.',
            },
          }),
          get readyState() {
            return esReadyState(es);
          },
          get isClosed() {
            return esReadyState(es) === 'closed';
          },
          sessionInfo: sessionParams,
        });
      };
      if (es.readyState === EventSource.CLOSED) {
        deliverError();
        return;
      }

      setTimeout(() => {
        if (es.readyState !== EventSource.OPEN) {
          deliverError();
        }
      }, 5000);
    }
  };

  es.onmessage = (e) => {
    handleMessage(JSON.parse(e.data));
  };

  const close = () => {
    closed = true;
    for (const sub of onCloseSubscribers) {
      try {
        sub();
      } catch (e) {
        console.error('Error in onClose callback', e);
      }
    }
    es.close();
  };

  return {
    close: close,
    [Symbol.iterator]: () => {
      throw new Error(
        'subscribeQuery does not support synchronous iteration. Use `for await` instead.',
      );
    },
    get sessionInfo() {
      return sessionParams;
    },
    get readyState() {
      return esReadyState(es);
    },
    get isClosed() {
      return esReadyState(es) === 'closed';
    },
    [Symbol.asyncIterator]: makeAsyncIterator.bind(
      this,
      subscribe,
      subscribeOnClose,
      unsubscribe,
      () => 1,
    ),
  };
}

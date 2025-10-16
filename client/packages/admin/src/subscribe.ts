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
} from '@instantdb/core';

export type SubscriptionReadyState = 'closed' | 'connecting' | 'open';

export type SubscribeQuerySessionInfo = {
  machineId: string;
  sessionId: string;
};

export type SubscribeQueryPayload<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  Config extends InstantConfig<Schema, boolean> = InstantConfig<Schema, false>,
> =
  | {
      type: 'ok';
      data: InstaQLResponse<Schema, Q, NonNullable<Config['useDateObjects']>>;
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
  Config extends InstantConfig<Schema, boolean> = InstantConfig<Schema, false>,
> = (payload: SubscribeQueryPayload<Schema, Q, Config>) => void;

export interface SubscribeQueryResponse<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  Config extends InstantConfig<Schema, boolean> = InstantConfig<Schema, false>,
> {
  /** Stop the subscription and close the connection. */
  close(): void;

  /** Warns when attempting to iterate synchronously */
  [Symbol.iterator](): never;

  /** Async iterator of query payloads */
  [Symbol.asyncIterator](): AsyncIterableIterator<
    SubscribeQueryPayload<Schema, Q, Config>
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
  Config extends InstantConfig<Schema, boolean> = InstantConfig<Schema, false>,
>(
  subscribe: (cb: SubscribeQueryCallback<Schema, Q, Config>) => void,
  subscribeOnClose: (cb: () => void) => void,
  unsubscribe: (cb: SubscribeQueryCallback<Schema, Q, Config>) => void,
  readyState: () => SubscriptionReadyState,
): AsyncGenerator<SubscribeQueryPayload<Schema, Q, Config>> {
  let wakeup = null;
  let closed = false;

  const backlog: SubscribeQueryPayload<Schema, Q, Config>[] = [];
  const handler: SubscribeQueryCallback<Schema, Q, Config> = (
    data: SubscribeQueryPayload<Schema, Q, Config>,
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

  const done = () => {
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

  const next = async () => {
    while (true) {
      if (readyState() === 'closed' || closed) {
        return done();
      }

      const nextValue = backlog.shift();
      if (nextValue) {
        return { value: nextValue, done: false };
      }

      const p = new Promise((resolve) => {
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
  }
}

function multiReadFetchResponse(r) {
  let p = null;
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

export function subscribe<
  Schema extends InstantSchemaDef<any, any, any>,
  Q extends ValidQuery<Q, Schema>,
  Config extends InstantConfig<Schema, boolean> = InstantConfig<Schema, false>,
>(
  query: Q,
  cb,
  opts: { headers: HeadersInit; inference: boolean; apiURI: string },
): SubscribeQueryResponse<Schema, Q, Config> {
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

  const subscribers: SubscribeQueryCallback<Schema, Q, Config>[] = [];
  const onCloseSubscribers = [];

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

  function deliver(result: SubscribeQueryPayload<Schema, Q, Config>) {
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
          sessionInfo: sessionParams,
        });
        break;
      }
      case 'refresh-ok': {
        if (msg.computations.length) {
          deliver({
            type: 'ok',
            data: msg.computations[0]['instaql-result'],
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

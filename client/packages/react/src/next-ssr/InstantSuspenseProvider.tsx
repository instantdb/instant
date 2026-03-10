'use client';
// InstantSuspenseProvider can only be used in a client context so this prevents errors from trying to use it in a server component.

import {
  FrameworkClient,
  InstantConfig,
  InstantSchemaDef,
  InstaQLResponse,
  PageInfoResponse,
  RuleParams,
  User,
  ValidQuery,
} from '@instantdb/core';
import InstantReactWebDatabase from '../InstantReactWebDatabase.ts';
import {
  createHydrationStreamProvider,
  isServer,
} from './HydrationStreamProvider.tsx';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';
import {
  InstantReactAbstractDatabase,
  useQueryInternal,
} from '@instantdb/react-common';

type InstantSuspenseProviderProps<
  Schema extends InstantSchemaDef<any, any, any>,
> = {
  nonce?: string;
  children: React.ReactNode;
  db?: InstantReactWebDatabase<Schema, any>;
  config?: Omit<InstantConfig<any, any>, 'schema'> & {
    schema: string;
  };
  user?: User | null;
};

const stream = createHydrationStreamProvider<any>();

type SuspenseQueryContextValue = {
  useSuspenseQuery: (query: any, opts?: SuspenseQueryOpts) => any;
  ssrUser: User | null | undefined;
};

export const SuspsenseQueryContext =
  createContext<SuspenseQueryContextValue | null>(null);

// Creates a typed useSuspense hook
export const createUseSuspenseQuery = <
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean,
>(
  _db: InstantReactWebDatabase<Schema, UseDates>,
): (<Q extends ValidQuery<Q, Schema>>(
  q: Q,
  opts?: {
    ruleParams: RuleParams;
  },
) => {
  data: InstaQLResponse<Schema, Q, NonNullable<UseDates>>;
  pageInfo?: PageInfoResponse<Q>;
}) => {
  return <Q extends ValidQuery<Q, Schema>>(q: any, opts: any) => {
    const ctx = useContext(SuspsenseQueryContext);
    if (!ctx) {
      throw new Error(
        'useSuspenseQuery must be used within a SuspenseQueryProvider',
      );
    }
    return ctx.useSuspenseQuery(q, opts) as any;
  };
};

type SuspenseQueryOpts = {
  ruleParams: RuleParams;
};

function makeUseSuspenseQueryServer(client: FrameworkClient) {
  return function useSuspenseQueryServer(query: any, opts: SuspenseQueryOpts) {
    let entry = client.getExistingResultForQuery(query, opts);

    if (!entry) {
      entry = client.query(query, opts);
    }

    if (entry.status === 'pending') {
      throw entry.promise;
    }

    if (entry.status === 'error') {
      throw entry.error;
    }

    if (entry.status === 'success') {
      switch (entry.type) {
        case 'session': {
          return entry.data;
        }
        case 'http': {
          const data = entry.data;
          const result = client.completeIsomorphic(
            query,
            data.triples,
            data.attrs,
            data.pageInfo,
          );

          return result;
        }
      }
    }
  };
}

function makeUseSuspenseQueryClient(
  db: InstantReactAbstractDatabase<any, any>,
  client: FrameworkClient,
) {
  function getEntry(query: any, opts: SuspenseQueryOpts, allowFetch: boolean) {
    const entry = client.getExistingResultForQuery(query, opts);

    if (entry?.status === 'pending') {
      throw entry.promise;
    }

    if (entry?.status === 'error') {
      return entry.error;
    }

    if (entry?.status === 'success') {
      switch (entry.type) {
        case 'session': {
          return entry.data;
        }
        case 'http': {
          const data = entry.data;
          const result = client.completeIsomorphic(
            query,
            data.triples,
            data.attrs,
            data.pageInfo,
          );

          return result;
        }
      }
    }

    if (allowFetch) {
      const promise = client.queryClient(query, opts);
      throw promise;
    }
  }

  return function useSuspenseQueryClient(query: any, opts: SuspenseQueryOpts) {
    const useQueryResult = useQueryInternal(
      db.core,
      query,
      opts,
      // Returns the server result for useSyncExternalStore
      () => {
        try {
          const res = getEntry(query, opts, false);
          return res;
        } catch (throwable) {
          return { error: throwable };
        }
      },
    );

    const hasData = !!useQueryResult.state.data;

    useEffect(() => {
      if (hasData) {
        // We have a newer result, so remove the cached SSR or suspended
        // result from the framework client cache
        client.removeCachedQueryResult(useQueryResult.queryHash);
      }
    }, [hasData]);

    if (useQueryResult.state.data) {
      return {
        data: useQueryResult.state.data,
        pageInfo: useQueryResult.state.pageInfo,
      };
    }

    if (useQueryResult.state.error) {
      throw useQueryResult.state.error;
    }

    return getEntry(query, opts, true);
  };
}

function createFrameworkClient(
  db: InstantReactAbstractDatabase<any, any>,
  user: User | null | undefined,
) {
  if (isServer) {
    if (user && !user.refresh_token) {
      throw new Error(
        'User must have a refresh_token field. Recieved: ' +
          JSON.stringify(user, null, 2),
      );
    }
    return new FrameworkClient({
      token: user?.refresh_token,
      db: db.core,
    });
  }

  // On the client, make sure we only have a single framework
  // in case our suspense provider gets unmounted
  const existing = db.core._reactor._frameworkClient;
  if (existing) {
    return existing;
  }
  const client = new FrameworkClient({ db: db.core });
  db.core._reactor.setFrameworkClient(client);
  return client;
}

export const InstantSuspenseProvider = (
  props: InstantSuspenseProviderProps<any>,
) => {
  if (!props.db) {
    throw new Error(
      'Must provide either a db or config to InstantSuspenseProvider',
    );
  }

  const db = props.db;

  const [trackedKeys] = useState(() => new Set<string>());

  const clientRef = useRef<FrameworkClient>(
    createFrameworkClient(props.db, props.user),
  );

  if (isServer) {
    clientRef.current.subscribe((result) => {
      const { queryHash } = result;
      trackedKeys.add(queryHash);
    });
  }

  const useSuspenseQuery = useCallback(
    isServer
      ? makeUseSuspenseQueryServer(clientRef.current)
      : makeUseSuspenseQueryClient(db, clientRef.current),
    [],
  );

  const contextValue = useMemo(() => {
    return { useSuspenseQuery, ssrUser: props.user };
  }, [useSuspenseQuery, props.user]);

  return (
    <SuspsenseQueryContext.Provider value={contextValue}>
      <stream.Provider
        nonce={props.nonce}
        onFlush={() => {
          const toSend: { queryKey: string; value: any }[] = [];
          for (const [key, value] of clientRef.current!.resultMap.entries()) {
            if (trackedKeys.has(key) && value.status === 'success') {
              toSend.push({
                queryKey: key,
                value: value.data,
              });
            }
          }

          trackedKeys.clear();
          return toSend;
        }}
        onEntries={(entries) => {
          entries.forEach((entry) => {
            clientRef.current!.addQueryResult(entry.queryKey, entry.value);
          });
        }}
      >
        {props.children}
      </stream.Provider>
    </SuspsenseQueryContext.Provider>
  );
};

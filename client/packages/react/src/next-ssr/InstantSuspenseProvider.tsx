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
import { createContext, useContext, useRef, useState } from 'react';
import { InstantReactAbstractDatabase } from '@instantdb/react-common';

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

export const InstantSuspenseProvider = (
  props: InstantSuspenseProviderProps<any>,
) => {
  const clientRef = useRef<FrameworkClient | null>(null);

  if (!props.db) {
    throw new Error(
      'Must provide either a db or config to InstantSuspenseProvider',
    );
  }

  const db = useRef<InstantReactAbstractDatabase<any, any>>(props.db);

  const [trackedKeys] = useState(() => new Set<string>());

  if (!clientRef.current) {
    if (props.user && !props.user.refresh_token) {
      throw new Error(
        'User must have a refresh_token field. Recieved: ' +
          JSON.stringify(props.user, null, 2),
      );
    }
    clientRef.current = new FrameworkClient({
      token: props.user?.refresh_token,
      db: db.current.core,
    });
  }

  if (isServer) {
    clientRef.current.subscribe((result) => {
      const { queryHash } = result;
      trackedKeys.add(queryHash);
    });
  }

  const useSuspenseQuery = (query: any, opts: SuspenseQueryOpts) => {
    const nonSuspenseResult = db.current.useQuery(query, {
      ...opts,
    });

    if (nonSuspenseResult.data) {
      return {
        data: nonSuspenseResult.data,
        pageInfo: nonSuspenseResult.pageInfo,
      };
    }

    // should never happen (typeguard)
    if (!clientRef.current) {
      throw new Error('Client ref not set up');
    }

    let entry = clientRef.current.getExistingResultForQuery(query, {
      ruleParams: opts?.ruleParams,
    });

    if (!entry) {
      entry = clientRef.current!.query(query, opts);
    }

    if (entry.status === 'pending') {
      throw entry.promise;
    }

    if (entry.status === 'error') {
      throw entry.error;
    }

    if (entry.status === 'success' && entry.type === 'session') {
      return entry.data;
    }

    if (entry.status === 'success') {
      const data = entry.data;
      const result = clientRef.current.completeIsomorphic(
        query,
        data.triples,
        data.attrs,
        data.pageInfo,
      );

      return result;
    }
  };

  return (
    <SuspsenseQueryContext.Provider
      value={{ useSuspenseQuery, ssrUser: props.user }}
    >
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

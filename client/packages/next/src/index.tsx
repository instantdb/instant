'use client';
import {
  FrameworkClient,
  FrameworkConfig,
  InstantConfig,
  InstantSchemaDef,
  InstaQLResponse,
  PageInfoResponse,
  RuleParams,
  ValidQuery,
} from '@instantdb/core';
import { createContext, useContext, useRef, useState } from 'react';
import {
  createHydrationStreamProvider,
  isServer,
} from './HydrationStreamProvider.tsx';
import { type InstantReactWebDatabase } from '@instantdb/react';

type InstantSuspenseProviderProps<
  Schema extends InstantSchemaDef<any, any, any>,
> = {
  nonce?: string;
  children: React.ReactNode;
  db: InstantReactWebDatabase<Schema, any>;
} & Omit<FrameworkConfig, 'db'>;

const stream = createHydrationStreamProvider<any>();

export const SuspsenseQueryContext = createContext<any | null>(null);

// Creates a typed useSuspense hook
export const createUseSuspenseQuery = <
  Schema extends InstantSchemaDef<any, any, any>,
  Config extends InstantConfig<Schema, boolean>,
>(
  _db: InstantReactWebDatabase<Schema, Config>,
): (<Q extends ValidQuery<Q, Schema>>(
  q: Q,
) => {
  data: InstaQLResponse<Schema, Q, NonNullable<Config['useDateObjects']>>;
  pageInfo?: PageInfoResponse<Q>;
}) => {
  return <Q extends ValidQuery<Q, Schema>>(q: any) => {
    const hook = useContext(SuspsenseQueryContext);
    return hook(q) as any;
  };
};

type SuspenseQueryOpts = {
  ruleParams: RuleParams;
};

export const InstantSuspenseProvider = (
  props: InstantSuspenseProviderProps<any>,
) => {
  const clientRef = useRef<FrameworkClient | null>(null);

  const [trackedKeys] = useState(() => new Set<string>());

  if (!clientRef.current) {
    clientRef.current = new FrameworkClient({
      ...props,
      db: props.db.core,
    });
  }

  if (isServer) {
    clientRef.current.subscribe((result) => {
      const { queryHash } = result;
      trackedKeys.add(queryHash);
    });
  }

  const useSuspenseQuery = (query: any, opts: SuspenseQueryOpts) => {
    const nonSuspenseResult = props.db.useQuery(query, {
      ...opts,
    });

    if (nonSuspenseResult.data) {
      return {
        data: nonSuspenseResult.data,
        pageInfo: nonSuspenseResult.pageInfo,
      };
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

    if (entry.status === 'success') {
      const data = entry.data;
      const result = clientRef.current.completeIsoMorphic(
        query,
        data.triples,
        data.attrs,
        data.pageInfo,
      );

      return result;
    }
  };

  return (
    <SuspsenseQueryContext.Provider value={useSuspenseQuery}>
      <stream.Provider
        nonce={props.nonce}
        onFlush={() => {
          const toSend = [];

          for (const [key, value] of clientRef.current.resultMap.entries()) {
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
            clientRef.current.addQueryResult(entry.queryKey, entry.value);
          });
        }}
      >
        {props.children}
      </stream.Provider>
    </SuspsenseQueryContext.Provider>
  );
};

'use client';
import {
  AuthState,
  FrameworkClient,
  InstantConfig,
  InstantSchemaDef,
  InstantUnknownSchema,
  InstaQLResponse,
  PageInfoResponse,
  parseSchemaFromJSON,
  RuleParams,
  User,
  ValidQuery,
} from '@instantdb/core';
import { createContext, useContext, useRef, useState } from 'react';
import {
  createHydrationStreamProvider,
  isServer,
} from './HydrationStreamProvider.tsx';
import version from '../version.ts';

import InstantReactWebDatabase from '../InstantReactWebDatabase.ts';
import { InstantReactAbstractDatabase } from '@instantdb/react-common';
import { init as baseInit } from '../init.ts';

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

const SuspsenseQueryContext = createContext<any | null>(null);

// Creates a typed useSuspense hook
export const createUseSuspenseQuery = <
  Schema extends InstantSchemaDef<any, any, any>,
  Config extends InstantConfig<Schema, boolean>,
>(
  _db: InstantReactWebDatabase<Schema, Config>,
): (<Q extends ValidQuery<Q, Schema>>(
  q: Q,
  opts?: {
    ruleParams: RuleParams;
  },
) => {
  data: InstaQLResponse<Schema, Q, NonNullable<Config['useDateObjects']>>;
  pageInfo?: PageInfoResponse<Q>;
}) => {
  return <Q extends ValidQuery<Q, Schema>>(q: any, opts: any) => {
    const hook = useContext(SuspsenseQueryContext);
    return hook(q, opts) as any;
  };
};

type SuspenseQueryOpts = {
  ruleParams: RuleParams;
};

export const InstantSuspenseProvider = (
  props: InstantSuspenseProviderProps<any>,
) => {
  const clientRef = useRef<FrameworkClient | null>(null);

  if (!props.db && !props.config) {
    throw new Error(
      'Must provide either a db or config to InstantSuspenseProvider',
    );
  }

  const db = useRef<InstantReactAbstractDatabase<any, any>>(
    props.db
      ? props.db
      : baseInit({
          ...props.config,
          schema: parseSchemaFromJSON(JSON.parse(props.config.schema)),
        }),
  );

  const [trackedKeys] = useState(() => new Set<string>());

  if (!clientRef.current) {
    if (props.user && !props.user.refresh_token) {
      throw new Error(
        'User must have a refresh_token field. Recieved: ' + props.user,
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
      console.log(entry.error);
      throw entry.error;
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

  const useAuth = (): AuthState => {
    const realAuthResult = db.current.useAuth();
    if (realAuthResult.isLoading && props.user) {
      return {
        error: null,
        isLoading: false,
        user: props.user,
      };
    }
    return realAuthResult;
  };

  return (
    <SuspsenseQueryContext.Provider value={{ useSuspenseQuery, useAuth }}>
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

/**
 *
 * The first step: init your application!
 *
 * Visit https://instantdb.com/dash to get your `appId` :)
 *
 * @example
 *  import { init } from "@instantdb/react"
 *
 *  const db = init({ appId: "my-app-id" })
 *
 *  // You can also provide a schema for type safety and editor autocomplete!
 *
 *  import { init } from "@instantdb/react"
 *  import schema from ""../instant.schema.ts";
 *
 *  const db = init({ appId: "my-app-id", schema })
 *
 *  // To learn more: https://instantdb.com/docs/modeling-data
 */
export function init<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
  UseDates extends boolean = false,
>(
  config: InstantConfig<Schema, UseDates>,
): InstantNextDatabase<Schema, InstantConfig<Schema, UseDates>> {
  return new InstantNextDatabase<Schema, InstantConfig<Schema, UseDates>>(
    config,
    {
      '@instantdb/react': version,
    },
  );
}

export class InstantNextDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  Config extends InstantConfig<Schema, boolean> = InstantConfig<Schema, false>,
> extends InstantReactWebDatabase<Schema, Config> {
  public useSuspenseQuery = <Q extends ValidQuery<Q, Schema>>(
    q: Q,
    opts?: {
      ruleParams: RuleParams;
    },
  ): {
    data: InstaQLResponse<Schema, Q, NonNullable<Config['useDateObjects']>>;
    pageInfo?: PageInfoResponse<Q>;
  } => {
    const { useSuspenseQuery } = useContext(SuspsenseQueryContext);
    if (!useSuspenseQuery) {
      throw new Error(
        'useSuspenseQuery must be used within a SuspenseQueryProvider',
      );
    }
    return useSuspenseQuery(q, opts) as any;
  };

  useAuth = (): AuthState => {
    const { useAuth: useAuthFromContext } = useContext(SuspsenseQueryContext);
    if (useAuthFromContext) {
      return useAuthFromContext();
    }
    return super._useAuth();
  };
}

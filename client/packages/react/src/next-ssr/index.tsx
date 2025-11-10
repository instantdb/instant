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

type SuspenseQueryContextValue = {
  useSuspenseQuery: (query: any, opts?: SuspenseQueryOpts) => any;
  ssrUser: User | null | undefined;
};

const SuspsenseQueryContext = createContext<SuspenseQueryContextValue | null>(
  null,
);

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

  if (!props.db && !props.config) {
    throw new Error(
      'Must provide either a db or config to InstantSuspenseProvider',
    );
  }

  const db = useRef<InstantReactAbstractDatabase<any, any>>(
    props.db
      ? props.db
      : baseInit({
          ...props.config!,
          schema: parseSchemaFromJSON(JSON.parse(props.config!.schema)),
        }),
  );

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
): InstantNextDatabase<Schema, UseDates> {
  return new InstantNextDatabase<Schema, UseDates>(config, {
    '@instantdb/react': version,
  });
}

export class InstantNextDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean,
> extends InstantReactWebDatabase<Schema, UseDates> {
  public useSuspenseQuery = <Q extends ValidQuery<Q, Schema>>(
    q: Q,
    opts?: {
      ruleParams: RuleParams;
    },
  ): {
    data: InstaQLResponse<Schema, Q, NonNullable<UseDates>>;
    pageInfo?: PageInfoResponse<Q>;
  } => {
    const ctx = useContext(SuspsenseQueryContext);
    if (!ctx) {
      throw new Error(
        'useSuspenseQuery must be used within a SuspenseQueryProvider',
      );
    }
    return ctx.useSuspenseQuery(q, opts) as any;
  };

  useAuth = (): AuthState => {
    const ctx = useContext(SuspsenseQueryContext);
    const realAuthResult = this._useAuth();
    if (!ctx) {
      return realAuthResult;
    }

    const { ssrUser } = ctx;
    if (ssrUser === undefined) {
      return realAuthResult;
    }
    if (realAuthResult.isLoading) {
      return {
        error: undefined,
        isLoading: false,
        user: ssrUser ?? undefined, // null -> undefined for the response
      };
    }

    return realAuthResult;
  };
}

import {
  weakHash,
  coerceQuery,
  type InstaQLOptions,
  InstantCoreDatabase,
  InstaQLLifecycleState,
  InstantSchemaDef,
  ValidQuery,
} from '@instantdb/core';
import { useCallback, useRef, useSyncExternalStore } from 'react';

const defaultState = {
  isLoading: true,
  data: undefined,
  pageInfo: undefined,
  error: undefined,
} as const;

function stateForResult(result: any) {
  return {
    isLoading: !Boolean(result),
    data: undefined,
    pageInfo: undefined,
    error: undefined,
    ...(result ? result : {}),
  };
}

export function useQueryInternal<
  Q extends ValidQuery<Q, Schema>,
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean,
>(
  _core: InstantCoreDatabase<Schema, UseDates>,
  _query: null | Q,
  _opts?: InstaQLOptions,
): {
  state: InstaQLLifecycleState<Schema, Q, UseDates>;
  query: any;
} {
  if (_query && _opts && 'ruleParams' in _opts) {
    _query = { $$ruleParams: _opts['ruleParams'], ..._query };
  }
  const query = _query ? coerceQuery(_query) : null;
  const queryHash = weakHash(query);

  // We use a ref to store the result of the query.
  // This is becuase `useSyncExternalStore` uses `Object.is`
  // to compare the previous and next state.
  // If we don't use a ref, the state will always be considered different, so
  // the component will always re-render.
  const resultCacheRef = useRef<InstaQLLifecycleState<Schema, Q, UseDates>>(
    stateForResult(_core._reactor.getPreviousResult(query)),
  );

  // Similar to `resultCacheRef`, `useSyncExternalStore` will unsubscribe
  // if `subscribe` changes, so we use `useCallback` to memoize the function.
  const subscribe = useCallback(
    (cb) => {
      // Update the ref when the query changes to avoid showing stale data
      resultCacheRef.current = stateForResult(
        _core._reactor.getPreviousResult(query),
      );
      // before the subscribeQuery is connected and calls it's own callback,
      // we might have data in the store via SSR, we need to notify useSyncExternalStore that
      // the data has changed.
      cb();

      // Don't subscribe if query is null
      if (!query) {
        const unsubscribe = () => {};
        return unsubscribe;
      }

      const unsubscribe = _core.subscribeQuery<Q, UseDates>(query, (result) => {
        resultCacheRef.current = {
          isLoading: !Boolean(result),
          // @ts-expect-error: ts thinks this will always be overwritten
          data: undefined,
          // @ts-expect-error: ts thinks this will always be overwritten
          pageInfo: undefined,
          // @ts-expect-error: ts thinks this will always be overwritten
          error: undefined,
          ...result,
        };

        cb();
      });

      return unsubscribe;
    },
    // Build a new subscribe function if the query changes
    [queryHash],
  );

  const state = useSyncExternalStore<
    InstaQLLifecycleState<Schema, Q, UseDates>
  >(
    subscribe,
    () => resultCacheRef.current,
    () => defaultState,
  );
  return { state, query };
}

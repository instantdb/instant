import {
  weakHash,
  coerceQuery,
  type Query,
  type Exactly,
  type InstantClient,
  type LifecycleSubscriptionState,
  type InstaQLQueryParams,
  type InstantGraph,
} from "@instantdb/core";
import { useCallback, useRef, useSyncExternalStore } from "react";

const defaultState = {
  isLoading: true,
  data: undefined,
  pageInfo: undefined,
  error: undefined,
};

function stateForResult(result: any) {
  return {
    isLoading: !Boolean(result),
    data: undefined,
    pageInfo: undefined,
    error: undefined,
    ...(result ? result : {}),
  };
}

export function useQuery<
  Q extends Schema extends InstantGraph<any, any>
    ? InstaQLQueryParams<Schema>
    : Exactly<Query, Q>,
  Schema extends InstantGraph<any, any, any> | {},
  WithCardinalityInference extends boolean,
>(
  _core: InstantClient<Schema, any, WithCardinalityInference>,
  _query: null | Q,
): {
  state: LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>;
  query: any;
} {
  const query = _query ? coerceQuery(_query) : null;
  const queryHash = weakHash(query);

  // We use a ref to store the result of the query.
  // This is becuase `useSyncExternalStore` uses `Object.is`
  // to compare the previous and next state.
  // If we don't use a ref, the state will always be considered different, so
  // the component will always re-render.
  const resultCacheRef = useRef<
    LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>
  >(stateForResult(_core._reactor.getPreviousResult(query)));

  // Similar to `resultCacheRef`, `useSyncExternalStore` will unsubscribe
  // if `subscribe` changes, so we use `useCallback` to memoize the function.
  const subscribe = useCallback(
    (cb) => {
      // Don't subscribe if query is null
      if (!query) {
        const unsubscribe = () => {};
        return unsubscribe;
      }

      const unsubscribe = _core.subscribeQuery<Q>(query, (result) => {
        resultCacheRef.current = {
          isLoading: !Boolean(result),
          data: undefined,
          pageInfo: undefined,
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
    LifecycleSubscriptionState<Q, Schema, WithCardinalityInference>
  >(
    subscribe,
    () => resultCacheRef.current,
    () => defaultState,
  );
  return { state, query };
}

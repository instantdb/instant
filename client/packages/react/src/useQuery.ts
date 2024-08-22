import {
  weakHash,
  coerceQuery,
  Query,
  Exactly,
  InstantClient,
  LifecycleSubscriptionState,
} from "@instantdb/core";
import { useCallback, useRef, useSyncExternalStore } from "react";

const defaultState = {
  isLoading: true,
  data: undefined,
  pageInfo: undefined,
  error: undefined,
};

export function useQuery<Q extends Query, Schema>(
  _core: InstantClient<Schema>,
  _query: Exactly<Query, Q> | null,
): { state: LifecycleSubscriptionState<Q, Schema>; query: any } {
  const query = _query ? coerceQuery(_query) : null;
  const queryHash = weakHash(query);

  // (XXX): We use a ref to store the result of the query because `useSyncExternalStore`
  // uses `Object.is` to compare the previous and next state.
  // If we don't use a ref, the state will always be considered different, so
  // the component will always re-render.
  const resultCacheRef =
    useRef<LifecycleSubscriptionState<Q, Schema>>(defaultState);

  // (XXX): Similar to `resultCacheRef`, `useSyncExternalStore` will unsubscribe if
  // `subscribe` changes, so we need to use `useCallback` to memoize the function.
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

  const state = useSyncExternalStore<LifecycleSubscriptionState<Q, Schema>>(
    subscribe,
    () => resultCacheRef.current,
    () => defaultState,
  );

  return { state, query };
}

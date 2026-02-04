import schema, { AppSchema } from "@/instant.schema";
import { ValidQuery } from "@instantdb/react";
import {
  useQueryClient,
  useSuspenseQuery,
  useQuery as useTanstackQuery,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { clientDb } from "./db";
import { InstaQLResponse } from "@instantdb/admin";

/**
 * Run an InstantDB query and keep it updated in TanStack query.
 * Uses JSON.stringify(query) as the query key
 * @example
 * ```ts
 * const { data, loading, error } = useInstantQuery({ todos: {} });
 * ```
 * @returns A TanstackQuery result object
 */
export const useInstantQuery = <Q extends ValidQuery<Q, typeof schema>>(
  query: Q,
) => {
  const queryClient = useQueryClient();
  const tanstackResult = useTanstackQuery({
    queryKey: [JSON.stringify(query)],
    queryFn: async (): Promise<InstaQLResponse<AppSchema, Q>> => {
      if (queryClient.getQueryCache().get(JSON.stringify(query))) {
        return queryClient
          .getQueryCache()
          .get(JSON.stringify(query)) as unknown as InstaQLResponse<
          AppSchema,
          Q
        >;
      }

      const result = await clientDb.queryOnce(query);
      return result.data as InstaQLResponse<AppSchema, Q>;
    },
    refetchOnMount: false,
    staleTime: 50000,
  });

  useEffect(() => {
    const unsub = clientDb.core.subscribeQuery(query, (resp) => {
      queryClient.setQueryData([JSON.stringify(query)], resp.data);
    });
    return unsub;
  }, [query]);

  return tanstackResult;
};

/**
 * Run an InstantDB query using suspense and keep it updated in TanStack query.
 * Uses JSON.stringify(query) as the query key
 * Data will always be defined.
 * @example
 * ```ts
 * const { data } = useInstantSuspenseQuery({ todos: {} });
 * ```
 * @returns A TanstackQuery result object
 */
export const useInstantSuspenseQuery = <Q extends ValidQuery<Q, typeof schema>>(
  query: Q,
) => {
  const queryClient = useQueryClient();
  const tanstackResult = useSuspenseQuery({
    queryKey: [JSON.stringify(query)],
    queryFn: async (): Promise<InstaQLResponse<AppSchema, Q>> => {
      const cachedData = queryClient.getQueryData<
        InstaQLResponse<AppSchema, Q>
      >([JSON.stringify(query)]);
      if (cachedData) {
        return cachedData;
      }

      const result = await clientDb.queryOnce(query);
      return result.data as InstaQLResponse<AppSchema, Q>;
    },
    refetchOnMount: false,
    staleTime: 50000,
  });

  useEffect(() => {
    const unsub = clientDb.core.subscribeQuery(query, (resp) => {
      queryClient.setQueryData([JSON.stringify(query)], resp.data);
    });
    return unsub;
  }, [JSON.stringify(query)]);

  return tanstackResult;
};

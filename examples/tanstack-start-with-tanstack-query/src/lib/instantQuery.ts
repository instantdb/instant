import schema, { AppSchema } from "@/instant.schema";
import { ValidQuery } from "@instantdb/react";
import {
  useQueryClient,
  useSuspenseQuery,
  useQuery as useTanstackQuery,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { db } from "./db";
import { InstaQLResponse } from "@instantdb/admin";

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

      const result = await db.queryOnce(query);
      return result.data as InstaQLResponse<AppSchema, Q>;
    },
    refetchOnMount: false,
    staleTime: 50000,
  });

  useEffect(() => {
    const unsub = db.core.subscribeQuery(query, (resp) => {
      queryClient.setQueryData([JSON.stringify(query)], resp.data);
    });
    return unsub;
  }, [query]);

  return tanstackResult;
};

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

      const result = await db.queryOnce(query);
      return result.data as InstaQLResponse<AppSchema, Q>;
    },
    refetchOnMount: false,
    staleTime: 50000,
  });

  useEffect(() => {
    const unsub = db.core.subscribeQuery(query, (resp) => {
      queryClient.setQueryData([JSON.stringify(query)], resp.data);
    });
    return unsub;
  }, [JSON.stringify(query)]);

  return tanstackResult;
};

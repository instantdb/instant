import { QueryClient } from "@tanstack/react-query";
import {
  createRouter,
  DefaultGlobalNotFound,
  ErrorComponent,
} from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";
import { getStartContext } from "@tanstack/start-storage-context";
import { createIsomorphicFn } from "@tanstack/react-start";
import { adminDb } from "./lib/adminDb";
import { User, ValidQuery } from "@instantdb/react";
import { AppSchema } from "./instant.schema";
import { db } from "./lib/db";

export interface RouterContext {
  queryClient: QueryClient;
  preloadQuery: <Q extends ValidQuery<Q, AppSchema>>(q: Q) => Promise<void>;
  getUser: () => Promise<User | null>;
}

const getUser = createIsomorphicFn()
  .server(async () => {
    const { request } = getStartContext();
    const user = await adminDb.auth.getUserFromRequest(request);
    return user;
  })
  .client(async () => {
    const user = await db.getAuth();
    return user;
  });

const preloadQueryFn = createIsomorphicFn()
  .server((queryClient: QueryClient) => {
    return async <Q extends ValidQuery<Q, AppSchema>>(q: Q) => {
      const { request } = getStartContext();
      const user = await adminDb.auth.getUserFromRequest(request, {
        disableValidation: true,
      });
      const scopedDb = user
        ? adminDb.asUser({ token: user.refresh_token })
        : adminDb.asUser({ guest: true });
      await queryClient.ensureQueryData({
        queryKey: [JSON.stringify(q)],
        queryFn: async () => {
          const data = await scopedDb.query(q);
          return data;
        },
      });
    };
  })
  .client((queryClient: QueryClient) => {
    return async <Q extends ValidQuery<Q, AppSchema>>(q: Q) => {
      await queryClient.ensureQueryData({
        queryKey: [JSON.stringify(q)],
        queryFn: async () => {
          const { data } = await db.queryOnce(q);
          return data;
        },
      });
    };
  });

type PreloadQueryFn = <Q extends ValidQuery<Q, AppSchema>>(
  q: Q,
) => Promise<void>;

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
      },
    },
  });

  // createIsomorphicFn infers to the type signature: T | T,
  // where T is PreloadQueryFn
  // this simplifies it to just T
  const preloadQuery = preloadQueryFn(queryClient) as PreloadQueryFn;

  const router = createRouter({
    routeTree,
    context: { queryClient, preloadQuery, getUser },
    defaultPreload: "intent",
    defaultNotFoundComponent: DefaultGlobalNotFound,
    defaultErrorComponent: ({ error }) => <ErrorComponent error={error} />,
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

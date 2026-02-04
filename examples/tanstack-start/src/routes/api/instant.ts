import { createFileRoute } from "@tanstack/react-router";
import { createInstantRouteHandler } from "@instantdb/react";

const appId = process.env.VITE_INSTANT_APP_ID!;

const handler = createInstantRouteHandler({
  appId,
});

export const Route = createFileRoute("/api/instant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        return handler.POST(request);
      },
    },
  },
});

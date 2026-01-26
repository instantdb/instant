import { createFileRoute } from "@tanstack/react-router";
import { createInstantRouteHandler } from "@instantdb/react";

const handler = createInstantRouteHandler({
  appId: process.env.VITE_INSTANT_APP_ID!,
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

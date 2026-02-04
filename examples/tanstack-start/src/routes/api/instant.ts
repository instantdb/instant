import { createFileRoute } from "@tanstack/react-router";
import { createInstantRouteHandler } from "@instantdb/react";

const appId = process.env.VITE_INSTANT_APP_ID;
if (!appId) {
  throw new Error("VITE_INSTANT_APP_ID environment variable is required");
}

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

import { createInstantRouteHandler } from "@instantdb/admin";

export const { GET, POST } = createInstantRouteHandler({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  apiURI: "http://localhost:8888",
});

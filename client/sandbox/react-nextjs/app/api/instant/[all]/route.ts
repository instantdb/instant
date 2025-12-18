import { createInstantRouteHandler } from '@instantdb/react/nextjs';

export const { GET, POST } = createInstantRouteHandler({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
});

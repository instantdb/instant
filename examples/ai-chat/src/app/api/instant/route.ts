import { createInstantRouteHandler } from '@instantdb/react/nextjs';

export const { POST } = createInstantRouteHandler({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
});

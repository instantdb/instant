import { createInstantRouteHandler } from '@instantdb/react';

const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID!;

const handler = createInstantRouteHandler({ appId });

export async function POST(request: Request) {
  return handler.POST(request);
}

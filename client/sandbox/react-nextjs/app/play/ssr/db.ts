'use client';
import { init } from '@instantdb/react/nextjs';
import schema from './instant.schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  // cookieEndpoint: 'https://my-awesome-site.com/api/instant',
  apiURI: 'http://localhost:8888',
  websocketURI: 'ws://localhost:8888/runtime/session',
  schema,
  useDateObjects: true,
});

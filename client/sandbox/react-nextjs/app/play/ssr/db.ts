'use client';
import { init } from '@instantdb/react/nextjs';
import schema from './instant.schema';

export const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

export const db = init({
  appId: appId!,
  firstPartyPath: '/api/instant',
  apiURI: 'http://localhost:8888',
  websocketURI: 'ws://localhost:8888/runtime/session',
  schema,
  useDateObjects: true,
});

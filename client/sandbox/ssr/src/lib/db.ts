import { init } from '@instantdb/react';
import schema from '../instant.schema';

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  websocketURI: 'ws://localhost:8888',
  apiURI: 'http://localhost:8888',
  schema,
  useDateObjects: true,
});

import { init } from '@instantdb/react';
import { Schema } from '@/Schema';

export const db = init<Schema>({
  appId: (import.meta as any).env.VITE_INSTANT_APP_ID,
  apiURI: 'http://localhost:8888',
  websocketURI: 'ws://localhost:8888/runtime/session',
  devtool: false,
});

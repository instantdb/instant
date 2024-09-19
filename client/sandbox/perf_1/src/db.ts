import { init } from '@instantdb/react';
import { Schema } from '@/Schema';

export const INSTANT_APP_ID = '2d960014-0690-4dc5-b13f-a3c202663241';

export const db = init<Schema>({
  appId: INSTANT_APP_ID,
  websocketURI: 'ws://localhost:8888/runtime/session',
  devtool: false,
});

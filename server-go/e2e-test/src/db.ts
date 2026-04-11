/**
 * InstantDB client — uses the REAL @instantdb/react package
 * pointed at the Go + SQLite backend.
 */
import { init, id, tx, lookup, type InstaQLEntity } from '@instantdb/react';

// App ID is injected at build time via Vite env
const APP_ID = (import.meta as any).env?.VITE_APP_ID || '';
const ADMIN_TOKEN = (import.meta as any).env?.VITE_ADMIN_TOKEN || '';

const API_URI = 'http://localhost:8888';
const WS_URI = 'ws://localhost:8888/runtime/session';

const db = init({
  appId: APP_ID,
  apiURI: API_URI,
  websocketURI: WS_URI,
});

export { db, id, tx, lookup, APP_ID, ADMIN_TOKEN, API_URI, WS_URI };
export type { InstaQLEntity };

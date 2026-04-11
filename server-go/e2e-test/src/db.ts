/**
 * InstantDB client — uses the REAL @instantdb/react package
 * pointed at the Go + SQLite backend.
 */
import { init, id, tx, type InstaQLEntity } from '@instantdb/react';

// App ID is injected at build time via Vite env
const APP_ID = (import.meta as any).env?.VITE_APP_ID || '';
const ADMIN_TOKEN = (import.meta as any).env?.VITE_ADMIN_TOKEN || '';

const db = init({
  appId: APP_ID,
  apiURI: 'http://localhost:8888',
  websocketURI: 'ws://localhost:8888/runtime/session',
});

export { db, id, tx };
export type { InstaQLEntity };

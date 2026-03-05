import { test as baseTest } from 'vitest';
import { init, InstantCoreDatabase } from '../../../src';

const apiUrl = import.meta.env.VITE_INSTANT_DEV
  ? 'http://localhost:8888'
  : import.meta.env.VITE_INSTANT_API_URL || 'https://api.instantdb.com';

const websocketURI = import.meta.env.VITE_INSTANT_DEV
  ? 'ws://localhost:8888/runtime/session'
  : import.meta.env.VITE_INSTANT_WEBSOCKET_URI ||
    'wss://api.instantdb.com/runtime/session';

export const e2eTest = baseTest.extend<{
  db: InstantCoreDatabase<any, false>;
}>({
  db: async ({ task, signal }, use) => {
    const response = await fetch(`${apiUrl}/dash/apps/ephemeral`, {
      body: JSON.stringify({ title: `e2e-${task.id}` }),
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal,
    });
    const { app } = await response.json();
    const db = init({ appId: app.id, apiURI: apiUrl, websocketURI });
    use(db);
  },
});

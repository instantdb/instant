import { test as baseTest } from 'vitest';
import {
  init,
  InstantCoreDatabase,
  InstantRules,
  InstantSchemaDef,
} from '../../../src';

// @ts-ignore
const apiUrl = import.meta.env.VITE_INSTANT_DEV
  ? 'http://localhost:8888'
  : // @ts-ignore
    import.meta.env.VITE_INSTANT_API_URL || 'https://api.instantdb.com';

// @ts-ignore
const websocketURI = import.meta.env.VITE_INSTANT_DEV
  ? 'ws://localhost:8888/runtime/session'
  : // @ts-ignore
    import.meta.env.VITE_INSTANT_WEBSOCKET_URI ||
    'wss://api.instantdb.com/runtime/session';

// Make a factory function that returns a typed test instance
export function makeE2ETest<Schema extends InstantSchemaDef<any, any, any>>({
  schema,
  rules,
}: {
  schema?: Schema;
  rules?: {
    code: InstantRules;
  };
}) {
  return baseTest.extend<{
    db: InstantCoreDatabase<Schema, false>;
    appId: string;
    adminToken: string;
  }>({
    db: async ({ task, signal }, use) => {
      const response = await fetch(`${apiUrl}/dash/apps/ephemeral`, {
        body: JSON.stringify({ title: `e2e-${task.id}`, schema, rules }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const { app } = await response.json();
      const db = init<Schema>({
        appId: app.id,
        apiURI: apiUrl,
        websocketURI,
        schema,
      });
      (db as any)._testApp = app;
      await use(db);
    },
    appId: async ({ db }, use) => {
      await use((db as any)._testApp.id);
    },
    adminToken: async ({ db }, use) => {
      await use((db as any)._testApp['admin-token']);
    },
  });
}

export { apiUrl };

export const e2eTest = makeE2ETest({});

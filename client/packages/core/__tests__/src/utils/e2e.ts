import { test as baseTest } from 'vitest';
import {
  init,
  InstantCoreDatabase,
  InstantRules,
  InstantSchemaDef,
} from '../../../src';

// __DEV_LOCAL_PORT__ is set by vitest.config.ts.
// This allows us to run tests against mulutple checkouts
// If CI=1 then __DEV_LOCAL_PORT__ will be falsey and tests will hit prod.
// Otherwise they will hit localhost at the specified port.
declare const __DEV_LOCAL_PORT__: number;

const apiUrl = __DEV_LOCAL_PORT__
  ? `http://localhost:${__DEV_LOCAL_PORT__}`
  : 'https://api.instantdb.com';

const websocketURI = __DEV_LOCAL_PORT__
  ? `ws://localhost:${__DEV_LOCAL_PORT__}/runtime/session`
  : 'wss://api.instantdb.com/runtime/session';

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

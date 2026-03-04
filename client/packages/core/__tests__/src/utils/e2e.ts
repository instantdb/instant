import { test as baseTest, expect } from 'vitest';
import { init, InstantCoreDatabase } from '../../../src';

export const e2eTest = baseTest.extend<{
  db: InstantCoreDatabase<any, false>;
}>({
  db: async ({ task, signal }, use) => {
    const response = await fetch(
      'https://api.instantdb.com/dash/apps/ephemeral',
      {
        body: JSON.stringify({ title: `e2e-${task.id}` }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal,
      },
    );
    const { app } = await response.json();
    const db = init({ appId: app.id });
    use(db);
  },
});

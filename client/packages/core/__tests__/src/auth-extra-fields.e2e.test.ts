import { test as baseTest, expect } from 'vitest';
import { init, i, type InstantCoreDatabase } from '../../src';

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

const schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      username: i.string().unique().indexed().optional(),
      displayName: i.string().optional(),
    }),
  },
});

async function generateMagicCode(
  appId: string,
  adminToken: string,
  email: string,
): Promise<string> {
  const res = await fetch(`${apiUrl}/admin/magic_code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  return data.code;
}

const authTest = baseTest.extend<{
  db: InstantCoreDatabase<typeof schema, false>;
}>({
  db: async ({ task, signal }, use) => {
    const response = await fetch(`${apiUrl}/dash/apps/ephemeral`, {
      body: JSON.stringify({ title: `e2e-auth-${task.id}`, schema }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const { app } = await response.json();
    const db = init<typeof schema>({
      appId: app.id,
      apiURI: apiUrl,
      websocketURI,
      schema,
    });
    // Stash app info on the db instance for tests to access
    (db as any)._testAppId = app.id;
    (db as any)._testAdminToken = app.admin_token;
    await use(db);
  },
});

authTest(
  'new user with extraFields gets fields written and created=true',
  async ({ db }) => {
    const appId = (db as any)._testAppId;
    const adminToken = (db as any)._testAdminToken;
    const email = `new-${Date.now()}@test.com`;

    const code = await generateMagicCode(appId, adminToken, email);
    const res = await db.auth.signInWithMagicCode({
      email,
      code,
      extraFields: { username: 'cool_user', displayName: 'Cool User' },
    });

    expect(res.created).toBe(true);

    const { data } = await db.queryOnce({ $users: {} });
    const user = data.$users.find((u: any) => u.email === email);
    expect(user).toBeDefined();
    expect(user!.username).toBe('cool_user');
    expect(user!.displayName).toBe('Cool User');
  },
);

authTest('returning user gets created=false', async ({ db }) => {
  const appId = (db as any)._testAppId;
  const adminToken = (db as any)._testAdminToken;
  const email = `returning-${Date.now()}@test.com`;

  // First sign in -- creates user
  const code1 = await generateMagicCode(appId, adminToken, email);
  const res1 = await db.auth.signInWithMagicCode({ email, code: code1 });
  expect(res1.created).toBe(true);

  // Second sign in -- existing user
  const code2 = await generateMagicCode(appId, adminToken, email);
  const res2 = await db.auth.signInWithMagicCode({ email, code: code2 });
  expect(res2.created).toBe(false);
});

authTest(
  'sign in without extraFields works (backwards compat)',
  async ({ db }) => {
    const appId = (db as any)._testAppId;
    const adminToken = (db as any)._testAdminToken;
    const email = `compat-${Date.now()}@test.com`;

    const code = await generateMagicCode(appId, adminToken, email);
    const res = await db.auth.signInWithMagicCode({ email, code });

    expect(res.user).toBeDefined();
    expect(res.user.email).toBe(email);
  },
);

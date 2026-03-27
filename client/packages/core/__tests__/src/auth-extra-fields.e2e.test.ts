import { expect } from 'vitest';
import { i } from '../../src';
import { makeE2ETest, apiUrl } from './utils/e2e';

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

const authTest = makeE2ETest({
  schema,
  rules: {
    code: {
      $users: {
        allow: {
          create: 'true',
        },
      },
    },
  },
});

authTest(
  'new user with extraFields gets fields written and created=true',
  async ({ db, appId, adminToken }) => {
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

authTest(
  'returning user gets created=false',
  async ({ db, appId, adminToken }) => {
    const email = `returning-${Date.now()}@test.com`;

    // First sign in -- creates user
    const code1 = await generateMagicCode(appId, adminToken, email);
    const res1 = await db.auth.signInWithMagicCode({ email, code: code1 });
    expect(res1.created).toBe(true);

    // Second sign in -- existing user
    const code2 = await generateMagicCode(appId, adminToken, email);
    const res2 = await db.auth.signInWithMagicCode({ email, code: code2 });
    expect(res2.created).toBe(false);
  },
);

authTest(
  'sign in without extraFields works (backwards compat)',
  async ({ db, appId, adminToken }) => {
    const email = `compat-${Date.now()}@test.com`;

    const code = await generateMagicCode(appId, adminToken, email);
    const res = await db.auth.signInWithMagicCode({ email, code });

    expect(res.user).toBeDefined();
    expect(res.user.email).toBe(email);
  },
);

authTest(
  'admin verify_magic_code returns { user, created } for checkMagicCode',
  async ({ db: _db, appId, adminToken }) => {
    const email = `admin-consume-${Date.now()}@test.com`;
    const code = await generateMagicCode(appId, adminToken, email);

    // Hit the admin endpoint directly (same as admin SDK checkMagicCode)
    const res = await fetch(
      `${apiUrl}/admin/verify_magic_code?app_id=${appId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          email,
          code,
          'extra-fields': { username: 'admin_user' },
        }),
      },
    );
    const data = await res.json();

    // Response should have user nested (not splatted) and created flag
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(email);
    expect(data.created).toBe(true);

    // Second call -- existing user
    const code2 = await generateMagicCode(appId, adminToken, email);
    const res2 = await fetch(
      `${apiUrl}/admin/verify_magic_code?app_id=${appId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ email, code: code2 }),
      },
    );
    const data2 = await res2.json();

    expect(data2.user).toBeDefined();
    expect(data2.created).toBe(false);
  },
);

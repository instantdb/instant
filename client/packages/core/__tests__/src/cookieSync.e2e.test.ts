import { expect, type TestContext, vi } from 'vitest';
import { http, HttpResponse, ws } from 'msw';
import { i, init, type User } from '../../src';
import { apiUrl, makeE2ETest } from './utils/e2e';
import { COOKIE_SYNC_LAST_UPDATED_KEY } from '../../src/Reactor';

const FIRST_PARTY_PATH = 'https://example.com';
const ONE_DAY_MS = 1_000 * 60 * 60 * 24;
const websocketURI = `${apiUrl.replace(/^http/, 'ws')}/runtime/session`;
const runtimeSession = ws.link(websocketURI);
const rules = {
  code: {},
};
const schema = i.schema({
  entities: {
    animal: i.entity({}),
  },
});

const test = makeE2ETest({
  rules,
  schema,
});

type InitDbConfig = {
  firstPartyPath?: string;
};

type SyncUserRequest = {
  type: 'sync-user';
  appId: string;
  user: User | null;
};

async function createApp(task: TestContext['task'], signal: AbortSignal) {
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
  return app;
}

function initDb(appId: string, config: InitDbConfig = {}) {
  return init({
    ...config,
    appId,
    apiURI: apiUrl,
    websocketURI,
    schema,
  });
}

async function primeCookieSync(
  appId: string,
  user: User,
  requests: SyncUserRequest[],
) {
  const db = initDb(appId, { firstPartyPath: FIRST_PARTY_PATH });
  try {
    await expect.poll(() => requests.length).toBe(1);
    await db._reactor.setCurrentUser(user);
    await db._reactor.syncUserToEndpoint(user);
    await expect.poll(() => requests.length).toBe(2);
    await db._reactor.kv.flush();
  } finally {
    db.shutdown();
  }
  requests.length = 0;
}

test('syncs user cookie on startup when last sync is at least a day old', async ({
  worker,
  task,
  signal,
}) => {
  const startTime = new Date('2026-01-01T00:00:00.000Z');
  vi.setSystemTime(startTime);
  let db: ReturnType<typeof initDb> | undefined;

  try {
    const app = await createApp(task, signal);
    const user: User = {
      id: 'user-id',
      refresh_token: 'refresh-token',
      isGuest: false,
    };

    const requests: SyncUserRequest[] = [];
    worker.use(
      runtimeSession.addEventListener('connection', () => {}),
      http.post(
        `${FIRST_PARTY_PATH}/`,
        async ({ request }: { request: Request }) => {
          requests.push((await request.json()) as SyncUserRequest);
          return new HttpResponse(null, { status: 200 });
        },
      ),
    );

    await primeCookieSync(app.id, user, requests);
    vi.setSystemTime(new Date(startTime.getTime() + ONE_DAY_MS));

    db = initDb(app.id, { firstPartyPath: FIRST_PARTY_PATH });
    await expect.poll(() => requests.length).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      type: 'sync-user',
      appId: app.id,
      user,
    });
  } finally {
    db?.shutdown();
    vi.useRealTimers();
  }
});

test('does not sync user cookie on startup when last sync is recent', async ({
  worker,
  task,
  signal,
}) => {
  const startTime = new Date('2026-01-01T00:00:00.000Z');
  vi.setSystemTime(startTime);
  let db: ReturnType<typeof initDb> | undefined;

  try {
    const app = await createApp(task, signal);
    const user: User = {
      id: 'user-id',
      refresh_token: 'refresh-token',
      isGuest: false,
    };

    const requests: SyncUserRequest[] = [];
    worker.use(
      runtimeSession.addEventListener('connection', () => {}),
      http.post(
        `${FIRST_PARTY_PATH}/`,
        async ({ request }: { request: Request }) => {
          requests.push((await request.json()) as SyncUserRequest);
          return new HttpResponse(null, { status: 200 });
        },
      ),
    );

    await primeCookieSync(app.id, user, requests);
    vi.setSystemTime(new Date(startTime.getTime() + ONE_DAY_MS - 1));

    db = initDb(app.id, { firstPartyPath: FIRST_PARTY_PATH });
    await db._reactor.kv.waitForKeyToLoad(COOKIE_SYNC_LAST_UPDATED_KEY);
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(requests).toHaveLength(0);
  } finally {
    db?.shutdown();
    vi.useRealTimers();
  }
});

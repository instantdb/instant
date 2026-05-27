import { expect, test } from 'vitest';
import {
  createInstantRouteHandler,
  createInstantRouteHandlerBody,
  type User,
} from '../../src';

const user: User = {
  id: 'user-id',
  refresh_token: 'refresh-token',
  isGuest: false,
};

test('createInstantRouteHandlerBody creates a typed sync-user body', () => {
  expect(
    createInstantRouteHandlerBody('sync-user', {
      appId: 'app-id',
      user,
    }),
  ).toEqual({
    type: 'sync-user',
    appId: 'app-id',
    user,
  });
});

test('createInstantRouteHandler accepts a sync-user body from the shared helper', async () => {
  const handler = createInstantRouteHandler({ appId: 'app-id' });
  const response = await handler.POST(
    new Request('https://example.com/api/instant', {
      method: 'POST',
      body: JSON.stringify(
        createInstantRouteHandlerBody('sync-user', {
          appId: 'app-id',
          user,
        }),
      ),
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get('set-cookie')).toContain('instant_user_app-id=');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=604800');
});

test('createInstantRouteHandler keeps rejecting unknown route handler types', async () => {
  const handler = createInstantRouteHandler({ appId: 'app-id' });
  const response = await handler.POST(
    new Request('https://example.com/api/instant', {
      method: 'POST',
      body: JSON.stringify({
        type: 'future-type',
        appId: 'app-id',
      }),
    }),
  );

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    ok: false,
    error: 'Unknown type: future-type',
  });
});

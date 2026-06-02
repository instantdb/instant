import { vi, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { i } from '../../src';
import { makeE2ETest } from './utils/e2e';
import { COOKIE_SYNC_LAST_UPDATED_KEY } from '../../src/Reactor';

const test = makeE2ETest({
  rules: {
    code: {},
  },
  schema: i.schema({
    entities: {
      animal: i.entity({}),
    },
  }),
  config: {
    firstPartyPath: 'https://example.com',
  },
});

test('does things', async ({ db, worker }) => {
  worker.use(
    http.post('https://example.com/', async () => {
      console.log('Mock server: cookie synced');
      return new HttpResponse(null, { status: 200 });
    }),
  );

  await db._reactor.syncUserToEndpoint({ testing: 123 });
  const last = db._reactor.kv.currentValue;
  expect(last[COOKIE_SYNC_LAST_UPDATED_KEY]).not.toBeNull();
});

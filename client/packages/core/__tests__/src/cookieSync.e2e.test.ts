import { vi } from 'vitest';
import { i } from '../../src';
import { makeE2ETest } from './utils/e2e';

const test = makeE2ETest({
  rules: {
    code: {},
  },
  schema: i.schema({
    entities: {
      animal: i.entity({}),
    },
  }),
});

export type User = {
  id: string;
  refresh_token: string;
  email?: string | null | undefined;
  imageURL?: string | null | undefined;
  type?: 'user' | 'guest' | undefined;
  isGuest: boolean;
};

test('does things', async ({ db }) => {
  const mocked = vi.mockObject(db);

  mocked._reactor._userSyncStorage?.getAllKeys.mockReturnValue(
    new Promise((resolve) => resolve(['value'])),
  );
  console.log(mocked._reactor._userSyncStorage?.getAllKeys);

  const keys = await mocked._reactor._userSyncStorage?.getAllKeys();
  console.log(keys);
  await mocked._reactor.syncUserToEndpoint({ testing: 123 });
});

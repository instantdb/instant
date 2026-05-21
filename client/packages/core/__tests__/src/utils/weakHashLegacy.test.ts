import { expect, test } from 'vitest';
import weakHashLegacy from '../../../src/utils/weakHashLegacy';

// These outputs are what the pre-v1.0.39 `weakHash` produced. They are the
// keys under which existing clients have persisted querySubs / syncSubs in
// IndexedDB. Don't change them — that would break the one-time migration.
test('produces stable hashes for known inputs', () => {
  const query = (propertyId: number) => ({
    pro_search_properties: {
      $: {
        where: {
          pro_searches: 'b14fae2f-ce9b-4677-b6a9-6dddd81914d0',
          propertyId,
        },
      },
      pro_searches: {},
    },
  });

  expect(weakHashLegacy(query(936))).toBe('dcb9614');
  expect(weakHashLegacy(query(27140))).toBe('dcb9614');
});

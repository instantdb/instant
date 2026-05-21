import { expect, test } from 'vitest';
import weakHashLegacy from '../../../src/utils/weakHashLegacy';

// Smoke test: pins the legacy hash output. Existing clients have
// persisted querySubs / syncSubs in IndexedDB under these exact keys,
// so any accidental change to the legacy implementation would silently
// break the one-time migration in Reactor / SyncTable.
test('produces a stable hash for a known query', () => {
  expect(
    weakHashLegacy({
      pro_search_properties: {
        $: {
          where: {
            pro_searches: 'b14fae2f-ce9b-4677-b6a9-6dddd81914d0',
            propertyId: 936,
          },
        },
        pro_searches: {},
      },
    }),
  ).toBe('dcb9614');
});

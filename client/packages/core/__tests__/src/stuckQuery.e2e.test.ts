import { describe, expect, vi } from 'vitest';
import { i, id } from '../../src';
import { makeE2ETest } from './utils/e2e';

// -----------------------------------------------------------------------------
// Stuck-query bug
//
// Symptom (from prod):
//   `db.useQuery(...)` returns `{ isLoading: true, data: undefined, error: undefined }`
//   forever. Reported by Mirando on Edge/Windows when many search cards
//   subscribe to per-card queries while scrolling.
//
// Client-side bug:
//   `Reactor.js:657` — the `add-query-exists` handler only wakes
//   `queryOnce` deferreds via `notifyOneQueryOnce`. Regular `subscribeQuery`
//   callbacks are not notified. If the server ever responds with
//   `add-query-exists` to a fresh subscriber that has no cached result, the
//   subscriber hangs.
//
// Server-side trigger (the race I found):
//   The grouped-queue routes `:add-query` and `:remove-query` for query `q`
//   to `[:query sess-id q]`, but `:refresh` goes to `[:refresh sess-id]`.
//   Those are *different groups* — they run concurrently.
//
//   1. Client subscribes Q. Server adds Q to `session-instaql-queries`
//      via `bump-instaql-version!`.
//   2. Some other transaction touches Q's topic. The invalidator marks Q
//      stale and enqueues a `:refresh` event.
//   3. The refresh worker reads `get-stale-instaql-queries` (Q is in the
//      snapshot) and pmap-dispatches `recompute-instaql-query!` tasks.
//   4. Concurrently, the client unsubscribes Q. The remove-query worker
//      retracts the Q entity from the store via `remove-query!`.
//   5. The refresh's recompute for Q now calls `bump-instaql-version!`.
//      `bump-instaql-version-tx-data` (store.clj:525) has an *else branch*
//      that CREATES the entity if it's missing. So Q is silently re-added
//      to the session.
//   6. Client re-subscribes Q. Server sees Q in session-instaql-queries
//      → replies `add-query-exists` → subscriber hangs (client bug).
//
// IDB caveat that hides the bug locally:
//   The reactor persists query results to IndexedDB. Once a query has
//   landed in IDB, the next subscribe loads from cache and notifies the
//   subscriber *before* the server's `add-query-exists` arrives — masking
//   the hang. The bug only manifests when IDB doesn't have the data for q,
//   which in prod is "this card I haven't viewed in a while was GC'd from
//   IDB" or "first visit to this search."
//
// The `add-query-exists hangs ...` test below uses a 2s sleep to let the
// throttled persistence write *delete* the just-unloaded key (PersistedObject
// keysToDelete branch), which is what reproduces the empty-cache prod state.
//
// Both bug-repro tests require an nREPL patch on the running server. With
// patches off they pass (bug doesn't trigger); with patches on they fail
// (bug triggers).
// -----------------------------------------------------------------------------

const test = makeE2ETest({
  schema: i.schema({
    entities: {
      pro_searches: i.entity({ title: i.string() }),
      properties: i.entity({ propertyId: i.number().indexed() }),
      pro_search_properties: i.entity({}),
    },
    links: {
      pspToSearch: {
        forward: {
          on: 'pro_search_properties',
          has: 'one',
          label: 'pro_searches',
        },
        reverse: {
          on: 'pro_searches',
          has: 'many',
          label: 'pro_search_properties',
        },
      },
    },
  }),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('stuck query repro', () => {
  // Baseline: the user's pattern (sub → data → unsub → re-sub) hammered 50×.
  // Passes with server in its normal state.
  test('rapid sub → unsub → sub does not hang (50 cycles)', async ({ db }) => {
    const searchId = id();
    await db.transact([
      db.tx.pro_searches[searchId].update({ title: 'baseline' }),
    ]);
    const q = {
      pro_search_properties: {
        $: { where: { 'pro_searches.id': searchId } },
        pro_searches: {},
      },
    };
    for (let i = 0; i < 50; i++) {
      let r1: any = null;
      const u1 = db.subscribeQuery(q, (r) => (r1 = r));
      await vi.waitFor(() => expect(r1?.data).toBeDefined(), {
        timeout: 5000,
      });
      u1();

      let r2: any = null;
      const u2 = db.subscribeQuery(q, (r) => (r2 = r));
      await vi.waitFor(() => expect(r2?.data).toBeDefined(), {
        timeout: 5000,
      });
      u2();
    }
  });

  // Bug repro — root cause path (refresh race).
  //
  //   Apply this server patch first (widens the race window so the test
  //   triggers deterministically):
  //
  //     cd server && ./scripts/nrepl-eval "(in-ns 'instant.reactive.session) \
  //       (def orig-recompute recompute-instaql-query!) \
  //       (alter-var-root #'recompute-instaql-query! \
  //         (constantly (fn [opts q] (Thread/sleep 300) (orig-recompute opts q)))) \
  //       :patched"
  //
  //   Restore: `(require 'instant.reactive.session :reload)`.
  test.skip('refresh race re-adds removed query → next sub hangs', async ({
    db,
  }) => {
    const searchId = id();
    await db.transact([
      db.tx.pro_searches[searchId].update({ title: 'race-test' }),
    ]);
    const q = {
      pro_search_properties: {
        $: { where: { 'pro_searches.id': searchId } },
        pro_searches: {},
      },
    };

    let r1: any = null;
    const u1 = db.subscribeQuery(q, (r) => (r1 = r));
    await vi.waitFor(() => expect(r1?.data).toBeDefined(), { timeout: 5000 });

    // Trigger refresh: invalidator marks q stale, queues `:refresh` event.
    db.transact([
      db.tx.pro_search_properties[id()]
        .update({})
        .link({ pro_searches: searchId }),
    ]);

    await sleep(20);
    u1(); // remove-query races the refresh worker

    // Wait for the patched 300ms recompute to finish — by which time the
    // refresh's bump-instaql-version! has re-created q in the session.
    await sleep(2000);

    let r2: any = null;
    const u2 = db.subscribeQuery(q, (r) => (r2 = r));
    try {
      await vi.waitFor(() => expect(r2?.data).toBeDefined(), {
        timeout: 5000,
      });
    } finally {
      u2();
    }
  });

  // Bug repro — symptom isolation.
  //
  //   Apply this server patch first (makes remove-query a no-op, simulating
  //   ANY way the server's session retains q):
  //
  //     cd server && ./scripts/nrepl-eval \
  //       "(alter-var-root #'instant.reactive.store/remove-query! \
  //          (constantly (fn [& _] nil))) :patched"
  //
  //   Restore: `(require 'instant.reactive.store :reload)`.
  test.skip('add-query-exists hangs a regular subscriber', async ({ db }) => {
    const searchId = id();
    await db.transact([
      db.tx.pro_searches[searchId].update({ title: 'noop-repro' }),
    ]);
    const q = {
      pro_search_properties: {
        $: { where: { 'pro_searches.id': searchId } },
        pro_searches: {},
      },
    };

    let r1: any = null;
    const u1 = db.subscribeQuery(q, (r) => (r1 = r));
    await vi.waitFor(() => expect(r1?.data).toBeDefined(), { timeout: 5000 });

    u1();
    // Long sleep so the throttled querySubs persist runs *after* unloadKey
    // and deletes the cached result from IDB (PersistedObject's keysToDelete
    // branch). This mirrors prod where IDB has no entry for the card.
    await sleep(2000);

    let r2: any = null;
    const u2 = db.subscribeQuery(q, (r) => (r2 = r));
    try {
      await vi.waitFor(() => expect(r2?.data).toBeDefined(), {
        timeout: 5000,
      });
    } finally {
      u2();
    }
  });
});

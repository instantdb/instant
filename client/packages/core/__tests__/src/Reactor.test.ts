// https://www.npmjs.com/package/fake-indexeddb
import 'fake-indexeddb/auto';
import { test, expect } from 'vitest';
import { setTimeout as sleep } from 'timers/promises';

import IndexedDBStorage from '../../src/IndexedDBStorage';

import Reactor from '../../src/Reactor';
import InMemoryStorage from '../../src/InMemoryStorage';
import * as instaml from '../../src/instaml';
import * as instatx from '../../src/instatx';
import zenecaAttrs from './data/zeneca/attrs.json';
import zenecaTriples from './data/zeneca/triples.json';
import uuid from '../../src/utils/id';
import { weakHash } from '../../src';
import { AttrsStoreClass } from '../../src/store';

const zenecaAttrsStore = new AttrsStoreClass(
  zenecaAttrs.reduce((res, x) => {
    res[x.id] = x;
    return res;
  }, {}),
  null,
);

async function waitForLoaded(reactor) {
  await reactor.querySubs.waitForMetaToLoad();
  await reactor.kv.waitForMetaToLoad();
  await reactor._pendingMutationsLoaded;
  await reactor.querySubs.flush();
  await reactor.kv.flush();
  await reactor.mutations.flush();
}

test('querySubs round-trips', async () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });
  reactor._initStorage(IndexedDBStorage);
  reactor._setAttrs(zenecaAttrs);
  const q = { users: {} };

  await waitForLoaded(reactor);

  const resultOne = new Promise((resolve, reject) => {
    reactor.subscribeQuery(q, (res) => {
      if (res.error) {
        reject(res.error);
      }
      resolve(res);
    });
  });

  // Initialize the store
  reactor._handleReceive(0, {
    op: 'add-query-ok',
    q,
    'processed-tx-id': 0,
    result: [
      {
        data: {
          'datalog-result': {
            'join-rows': [zenecaTriples],
          },
        },
        'child-nodes': [],
      },
    ],
  });

  const data1 = await resultOne;

  // Make sure the store has the data we expect
  expect(data1.data.users.map((x) => x.handle)).toEqual([
    'joe',
    'alex',
    'stopa',
    'nicolegf',
  ]);

  await waitForLoaded(reactor);

  // Create a new reactor
  const reactor2 = new Reactor({ appId });
  reactor2._initStorage(IndexedDBStorage);
  reactor2._setAttrs(zenecaAttrs);

  await waitForLoaded(reactor2);
  await reactor2.querySubs.waitForKeyToLoad(weakHash(q));

  // Check that it pull the data from indexedDB
  const res = await new Promise((resolve, reject) => {
    reactor2.subscribeQuery(q, (res) => {
      if (res.error) {
        reject(res.error);
      }
      resolve(res);
    });
  });

  expect(res.data.users.map((x) => x.handle)).toEqual([
    'joe',
    'alex',
    'stopa',
    'nicolegf',
  ]);
});

test('rewrite mutations', () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });

  const bookId = 'bookId';
  const bookshelfId = 'bookshelfId';
  const ops = [
    instatx.tx.books[bookId].update({ title: 'title' }),
    instatx.tx.users[instatx.lookup('handle', 'stopa')].update({
      email: 's@example.com',
    }),
    instatx.tx.bookshelves[bookshelfId].link({
      users: { handle: 'stopa' },
    }),
    instatx.tx.bookshelves[bookshelfId].unlink({
      users: ['handle', 'joe'],
    }),
    instatx.tx.bookshelves[bookshelfId].unlink({
      users: instatx.lookup('handle', 'joe'),
    }),
  ];

  // create transactions without any attributes
  const optimisticSteps = instaml.transform(
    { attrsStore: new AttrsStoreClass({}, null) },
    ops,
  );

  const mutations = new Map([['k', { 'tx-steps': optimisticSteps }]]);

  const rewrittenWithoutAttrs = reactor
    ._rewriteMutations(new AttrsStoreClass({}, null), mutations)
    .get('k')['tx-steps'];

  // Check that we didn't clobber anything in our rewrite
  expect(rewrittenWithoutAttrs).toEqual(optimisticSteps);

  // rewrite them with the new server attributes
  const rewrittenSteps = reactor
    ._rewriteMutations(zenecaAttrsStore, mutations)
    .get('k')['tx-steps'];

  const serverSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, ops);
  expect(rewrittenSteps).toEqual(serverSteps);
});

test('rewrite mutations works with multiple transactions', () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });
  reactor._initStorage(InMemoryStorage);

  const bookId = 'bookId';
  const bookshelfId = 'bookshelfId';
  const ops = [
    instatx.tx.books[bookId].update({ title: 'title' }),
    instatx.tx.users[instatx.lookup('handle', 'stopa')].update({
      email: 's@example.com',
    }),
    instatx.tx.bookshelves[bookshelfId].link({
      users: { handle: 'stopa' },
    }),
    instatx.tx.bookshelves[bookshelfId].unlink({
      users: ['handle', 'joe'],
    }),
    instatx.tx.bookshelves[bookshelfId].unlink({
      users: instatx.lookup('handle', 'joe'),
    }),
  ];

  const keys = ['a', 'b', 'c', 'd'];

  for (const k of keys) {
    const attrs = reactor.optimisticAttrs();
    const steps = instaml.transform({ attrsStore: attrs }, ops);
    const mut = {
      op: 'transact',
      'tx-steps': steps,
    };
    reactor._updatePendingMutations((prev) => {
      prev[k] = mut;
    });
  }

  // rewrite them with the new server attributes
  const rewrittenMutations = reactor._rewriteMutations(
    zenecaAttrsStore,
    reactor._pendingMutations(),
  );

  const serverSteps = instaml.transform({ attrsStore: zenecaAttrsStore }, ops);
  for (const k of keys) {
    expect(rewrittenMutations.get(k)['tx-steps']).toEqual(serverSteps);
  }
});

test('optimisticTx is not overwritten by refresh-ok', async () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });
  reactor._initStorage(IndexedDBStorage);
  reactor._setAttrs(zenecaAttrs);
  const q = { users: {} };
  const joe_id = 'ce942051-2d74-404a-9c7d-4aa3f2d54ae4';

  await waitForLoaded(reactor);

  let data = null;

  reactor.subscribeQuery(q, (res) => {
    data = res;
  });

  // Initialize the store
  reactor._handleReceive(0, {
    op: 'add-query-ok',
    q,
    'processed-tx-id': 0,
    result: [
      {
        data: {
          'datalog-result': {
            'join-rows': [zenecaTriples],
          },
        },
        'child-nodes': [],
      },
    ],
  });

  await reactor.querySubs.flush();

  expect(data.data.users.map((x) => x.handle)).toEqual([
    'joe',
    'alex',
    'stopa',
    'nicolegf',
  ]);

  // first optimistic
  const ops2 = [
    instatx.tx.users[joe_id].update({
      handle: 'joe2',
    }),
  ];

  reactor.pushTx(ops2);

  await reactor.querySubs.flush();

  expect(data.data.users.map((x) => x.handle)).toEqual([
    'joe2',
    'alex',
    'stopa',
    'nicolegf',
  ]);

  const [eventId2] = reactor._pendingMutations().keys();

  // second optimistic
  const ops3 = [
    instatx.tx.users[joe_id].update({
      handle: 'joe3',
    }),
  ];

  reactor.pushTx(ops3);

  await reactor.querySubs.flush();

  expect(data.data.users.map((x) => x.handle)).toEqual([
    'joe3',
    'alex',
    'stopa',
    'nicolegf',
  ]);

  const [_, eventId3] = reactor._pendingMutations().keys();

  // confirmation from server for first optimistic
  reactor._handleReceive(1, {
    op: 'transact-ok',
    'client-event-id': eventId2,
    'tx-id': 100,
  });

  await waitForLoaded(reactor);

  expect(data.data.users.map((x) => x.handle)).toEqual([
    'joe3',
    'alex',
    'stopa',
    'nicolegf',
  ]);

  // query refresh after first tx
  reactor._handleReceive(3, {
    op: 'refresh-ok',
    'processed-tx-id': 100,
    attrs: zenecaAttrs,
    computations: [
      {
        'instaql-query': q,
        'instaql-result': [
          {
            data: {
              'datalog-result': {
                'join-rows': [zenecaTriples],
              },
            },
            'child-nodes': [],
          },
        ],
      },
    ],
  });

  // make sure it doesn’t override local results
  await waitForLoaded(reactor);

  expect(data.data.users.map((x) => x.handle)).toEqual([
    'joe3',
    'alex',
    'stopa',
    'nicolegf',
  ]);

  // confirmation from server for second optimistic
  reactor._handleReceive(2, {
    op: 'transact-ok',
    'client-event-id': eventId3,
    'tx-id': 101,
  });

  await waitForLoaded(reactor);

  expect(data.data.users.map((x) => x.handle)).toEqual([
    'joe3',
    'alex',
    'stopa',
    'nicolegf',
  ]);

  // make sure it still doesn’t override local results
  await waitForLoaded(reactor);

  expect(data.data.users.map((x) => x.handle)).toEqual([
    'joe3',
    'alex',
    'stopa',
    'nicolegf',
  ]);
});

test("we don't cleanup mutations we're still waiting on", async () => {
  const appId = uuid();
  const reactor = new Reactor({
    appId,
    pendingTxCleanupTimeout: 1,
    pendingMutationCleanupThreshold: 0,
  });

  reactor._initStorage(IndexedDBStorage);
  reactor._setAttrs(zenecaAttrs);
  const q = { users: {} };
  const joe_id = 'ce942051-2d74-404a-9c7d-4aa3f2d54ae4';

  await waitForLoaded(reactor);

  // Add two transactions
  const ops1 = [
    instatx.tx.users[joe_id].update({
      handle: 'joe2',
    }),
  ];

  reactor.pushTx(ops1);

  const ops2 = [
    instatx.tx.users[joe_id].update({
      handle: 'joe2',
    }),
  ];

  reactor.pushTx(ops2);

  await reactor.kv.flush();

  const [ev1, ev2] = reactor._pendingMutations().keys();

  // Mark one as received
  reactor._handleReceive(1, {
    op: 'transact-ok',
    'client-event-id': ev1,
    'tx-id': 100,
  });

  // Wait for the pendingTxCleanupTimeout to expire
  await sleep(10);

  // Cleanup shouldn't remove the mutation we're still waiting on
  await reactor._cleanupPendingMutationsTimeout();

  const remainingKeys = new Array(...reactor._pendingMutations().keys());

  expect(remainingKeys).toStrictEqual([ev2]);
});

test('getLocalId always returns the same id', async () => {
  const appId = uuid();

  const idbs = new Map();

  // Class that reuses the same underlying storage for indexeddb.
  // This will make fake-indexeddb act more like the browser, otherwise
  // we get a fresh in-memory store each time we call indexedDB.open
  class IDBStorage {
    constructor(appId, dbName) {
      if (idbs.get(dbName)) {
        return idbs.get(dbName);
      }
      const idb = new IndexedDBStorage(appId, dbName);
      idbs.set(dbName, idb);
      return idb;
    }
  }

  const reactor = new Reactor({
    appId,
    pendingTxCleanupTimeout: 1,
    pendingMutationCleanupThreshold: 0,
  });

  reactor._initStorage(IDBStorage);

  const promises = [];

  const ids = new Set();

  for (const _ of [...new Array(1000)]) {
    const p = reactor.getLocalId('id').then((id) => ids.add(id));
    promises.push(p);
  }

  await Promise.all(promises);

  expect(ids.size).toBe(1);
  await reactor.querySubs.flush();

  await reactor.kv.flush();

  const reactor2 = new Reactor({
    appId,
    pendingTxCleanupTimeout: 1,
    pendingMutationCleanupThreshold: 0,
  });

  async function idbSnapshot(idb, { includeMeta }) {
    const keys = await idb.getAllKeys();
    const res = {};
    for (const key of keys) {
      if (key === '__meta' && !includeMeta) {
        continue;
      }
      res[key] = await idb.getItem(key);
    }
    return res;
  }

  reactor2._initStorage(IDBStorage);

  const id = await reactor2.getLocalId('id');

  expect(id).toStrictEqual([...ids][0]);
});

async function makeLegacyDb(name, stores, fill) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      for (const storeName of stores) {
        req.result.createObjectStore(storeName);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    fill(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

test('pending mutations persist as one row per mutation', async () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });
  reactor._initStorage(IndexedDBStorage);
  reactor._setAttrs(zenecaAttrs);
  await waitForLoaded(reactor);

  reactor.pushTx([instatx.tx.books[uuid()].update({ title: 'one' })]);
  reactor.pushTx([instatx.tx.books[uuid()].update({ title: 'two' })]).catch(
    () => {},
  );
  const [ev1, ev2] = [...reactor._pendingMutations().keys()];
  await reactor.mutations.flush();

  const mutationStore = new IndexedDBStorage(appId, 'mutations');
  const keys = await mutationStore.getAllKeys();
  expect(keys).toContain(ev1);
  expect(keys).toContain(ev2);
  expect(await mutationStore.getItem(ev1)).toMatchObject({ op: 'transact' });

  // The kv store no longer holds the old blob
  const kvStore = new IndexedDBStorage(appId, 'kv');
  expect(await kvStore.getItem('pendingMutations')).toBeNull();

  // Deleting a mutation removes just its row
  reactor._handleMutationError('error', ev2, { message: 'test' });
  await reactor.mutations.flush();
  const keysAfter = await mutationStore.getAllKeys();
  expect(keysAfter).toContain(ev1);
  expect(keysAfter).not.toContain(ev2);
});

test('pending mutations round-trip across reloads and unconfirmed ones are re-sent', async () => {
  const appId = uuid();
  const reactor = new Reactor({ appId });
  reactor._initStorage(IndexedDBStorage);
  reactor._setAttrs(zenecaAttrs);
  await waitForLoaded(reactor);

  reactor.pushTx([instatx.tx.books[uuid()].update({ title: 'offline' })]);
  const [eventId] = [...reactor._pendingMutations().keys()];
  await reactor.mutations.flush();

  const reactor2 = new Reactor({ appId });
  const sent = [];
  reactor2._sendMutation = (evId, _mut) => {
    sent.push(evId);
  };
  reactor2._initStorage(IndexedDBStorage);
  await waitForLoaded(reactor2);

  expect([...reactor2._pendingMutations().keys()]).toEqual([eventId]);
  expect(sent).toEqual([eventId]);
});

test('upgrades v6 databases, splitting pending mutations into rows', async () => {
  const appId = uuid();
  const mutA = { op: 'transact', 'tx-steps': [], created: 1, order: 1 };
  const mutB = {
    op: 'transact',
    'tx-steps': [],
    created: 2,
    order: 2,
    'tx-id': 5,
  };
  await makeLegacyDb(
    `instant_${appId}_6`,
    ['kv', 'querySubs', 'syncSubs'],
    (tx) => {
      const kv = tx.objectStore('kv');
      kv.put(
        [
          ['evA', mutA],
          ['evB', mutB],
        ],
        'pendingMutations',
      );
      kv.put({ id: 'u1' }, 'currentUser');
      kv.put(
        {
          objects: {
            pendingMutations: { createdAt: 1, updatedAt: 1, size: 0 },
            currentUser: { createdAt: 1, updatedAt: 1, size: 0 },
          },
        },
        '__meta',
      );
      tx.objectStore('querySubs').put({ some: 'sub' }, 'hash1');
    },
  );

  const mutationStore = new IndexedDBStorage(appId, 'mutations');
  expect(await mutationStore.getItem('evA')).toEqual(mutA);
  expect(await mutationStore.getItem('evB')).toEqual(mutB);
  // The migration writes a meta row so boot can enumerate the mutations
  expect((await mutationStore.getItem('__meta')).objects).toHaveProperty(
    'evA',
  );

  const kvStore = new IndexedDBStorage(appId, 'kv');
  expect(await kvStore.getItem('pendingMutations')).toBeNull();
  expect(await kvStore.getItem('currentUser')).toEqual({ id: 'u1' });
  expect(
    (await kvStore.getItem('__meta')).objects.pendingMutations,
  ).toBeUndefined();

  const querySubStore = new IndexedDBStorage(appId, 'querySubs');
  expect(await querySubStore.getItem('hash1')).toEqual({ some: 'sub' });
});

test('a reactor booting on migrated v6 data adopts and re-sends unconfirmed mutations', async () => {
  const appId = uuid();
  const mutA = { op: 'transact', 'tx-steps': [], created: 1, order: 1 };
  const mutB = {
    op: 'transact',
    'tx-steps': [],
    created: 2,
    order: 2,
    'tx-id': 5,
  };
  await makeLegacyDb(
    `instant_${appId}_6`,
    ['kv', 'querySubs', 'syncSubs'],
    (tx) => {
      tx.objectStore('kv').put(
        [
          ['evA', mutA],
          ['evB', mutB],
        ],
        'pendingMutations',
      );
    },
  );

  const reactor = new Reactor({ appId });
  const sent = [];
  reactor._sendMutation = (evId, _mut) => {
    sent.push(evId);
  };
  reactor._initStorage(IndexedDBStorage);
  await waitForLoaded(reactor);

  expect([...reactor._pendingMutations().keys()].sort()).toEqual([
    'evA',
    'evB',
  ]);
  // evA was never confirmed by the server, so it gets re-sent; evB has a
  // tx-id and does not
  expect(sent).toEqual(['evA']);
});

test('upgrades v5 databases through to per-mutation rows', async () => {
  const appId = uuid();
  const mutOld = { op: 'transact', 'tx-steps': [], created: 1, order: 1 };
  await makeLegacyDb(`instant_${appId}_5`, ['kv'], (tx) => {
    const kv = tx.objectStore('kv');
    // v5 JSON.stringified values before storing
    kv.put(JSON.stringify([['evOld', mutOld]]), 'pendingMutations');
    kv.put({ id: 'u5' }, 'currentUser');
  });

  const mutationStore = new IndexedDBStorage(appId, 'mutations');
  expect(await mutationStore.getItem('evOld')).toEqual(mutOld);

  const kvStore = new IndexedDBStorage(appId, 'kv');
  expect(await kvStore.getItem('pendingMutations')).toBeNull();
  expect(await kvStore.getItem('currentUser')).toEqual({ id: 'u5' });
});

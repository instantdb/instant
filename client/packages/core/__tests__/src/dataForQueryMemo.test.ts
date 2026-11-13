// https://www.npmjs.com/package/fake-indexeddb
import 'fake-indexeddb/auto';
import { test, expect, vi } from 'vitest';

import IndexedDBStorage from '../../src/IndexedDBStorage';

import Reactor from '../../src/Reactor';
import * as instatx from '../../src/instatx';
import zenecaAttrs from './data/zeneca/attrs.json';
import zenecaTriples from './data/zeneca/triples.json';
import uuid from '../../src/utils/id';
import { weakHash } from '../../src';

const joe_id = 'ce942051-2d74-404a-9c7d-4aa3f2d54ae4';

async function waitForLoaded(reactor) {
  await reactor.querySubs.waitForMetaToLoad();
  await reactor.kv.waitForMetaToLoad();
  await reactor.kv.waitForKeyToLoad('pendingMutations');
  await reactor.querySubs.flush();
  await reactor.kv.flush();
}

function addQueryOk(reactor, q, joinRows) {
  reactor._handleReceive(0, {
    op: 'add-query-ok',
    q,
    'processed-tx-id': 0,
    result: [
      {
        data: { 'datalog-result': { 'join-rows': joinRows } },
        'child-nodes': [],
      },
    ],
  });
}

// A reactor subscribed to `{ users: {} }` with the zeneca users loaded and one
// pending optimistic update, so every recompute has a mutation to re-apply.
// A second query then receives its result: that moves querySubs' version but
// notifies only the second query, so the users query is read between notifies,
// as a re-rendering useQuery reads it.
async function setup() {
  const reactor = new Reactor({ appId: uuid() });
  reactor._initStorage(IndexedDBStorage);
  reactor._setAttrs(zenecaAttrs);
  const q = { users: {} };
  const hash = weakHash(q);
  const otherQ = { bookshelves: {} };

  await waitForLoaded(reactor);

  const cb = vi.fn();
  reactor.subscribeQuery(q, cb);
  addQueryOk(reactor, q, [zenecaTriples]);

  reactor.pushTx([instatx.tx.users[joe_id].update({ handle: 'joe2' })]);
  await waitForLoaded(reactor);

  reactor.subscribeQuery(otherQ, () => {});
  addQueryOk(reactor, otherQ, []);
  await waitForLoaded(reactor);

  const applyOptimisticUpdates = vi.spyOn(reactor, '_applyOptimisticUpdates');
  return { reactor, q, hash, cb, applyOptimisticUpdates };
}

const handles = (result) => result.data.users.map((x) => x.handle);

test('dataForQuery returns the same result between notifies without re-applying pending mutations', async () => {
  const { reactor, q, hash, applyOptimisticUpdates } = await setup();

  const first = reactor.dataForQuery(hash);
  expect(handles(first.data)).toEqual(['joe2', 'alex', 'stopa', 'nicolegf']);

  // useQuery calls getPreviousResult on every render.
  for (let i = 0; i < 10; i++) {
    expect(reactor.dataForQuery(hash)).toBe(first);
    expect(reactor.getPreviousResult(q)).toBe(first.data);
  }
  expect(applyOptimisticUpdates).toHaveBeenCalledTimes(1);
});

test('dataForQuery recomputes after a new pending mutation', async () => {
  const { reactor, hash, applyOptimisticUpdates } = await setup();

  const first = reactor.dataForQuery(hash);
  reactor.pushTx([instatx.tx.users[joe_id].update({ handle: 'joe3' })]);
  await waitForLoaded(reactor);

  const second = reactor.dataForQuery(hash);
  expect(second).not.toBe(first);
  expect(handles(second.data)).toEqual(['joe3', 'alex', 'stopa', 'nicolegf']);
  const calls = applyOptimisticUpdates.mock.calls.length;
  expect(reactor.dataForQuery(hash)).toBe(second);
  expect(applyOptimisticUpdates).toHaveBeenCalledTimes(calls);
});

test('dataForQuery caches applyOptimistic true and false separately', async () => {
  const { reactor, hash } = await setup();

  const optimistic = reactor.dataForQuery(hash, true);
  const confirmed = reactor.dataForQuery(hash, false);

  expect(handles(optimistic.data)).toEqual([
    'joe2',
    'alex',
    'stopa',
    'nicolegf',
  ]);
  expect(handles(confirmed.data)).toEqual(['joe', 'alex', 'stopa', 'nicolegf']);
  expect(reactor.dataForQuery(hash, true)).toBe(optimistic);
  expect(reactor.dataForQuery(hash, false)).toBe(confirmed);
});

test('a read between notifies does not affect notifyOne deduping', async () => {
  const { reactor, hash, cb } = await setup();
  const callsBefore = cb.mock.calls.length;

  // Deep-equal data: no callback, even though the read above memoised it.
  reactor.dataForQuery(hash);
  reactor.notifyOne(hash);
  expect(cb).toHaveBeenCalledTimes(callsBefore);

  // Changed data: the callback still fires.
  reactor.pushTx([instatx.tx.users[joe_id].update({ handle: 'joe3' })]);
  await waitForLoaded(reactor);
  reactor.dataForQuery(hash);
  reactor.notifyOne(hash);
  expect(handles(cb.mock.lastCall[0])).toEqual([
    'joe3',
    'alex',
    'stopa',
    'nicolegf',
  ]);
});

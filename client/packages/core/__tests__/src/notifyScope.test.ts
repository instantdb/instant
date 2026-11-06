// https://www.npmjs.com/package/fake-indexeddb
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, test, vi } from 'vitest';
import { setTimeout as sleep } from 'timers/promises';

import IndexedDBStorage from '../../src/IndexedDBStorage';
import Reactor from '../../src/Reactor';
import * as instaml from '../../src/instaml';
import { tx, lookup } from '../../src/instatx';
import instaql from '../../src/instaql';
import { AttrsStoreClass, createStore } from '../../src/store';
import {
  mutationFootprint,
  queryFootprint,
  footprintsIntersect,
} from '../../src/notifyScope';
import zenecaAttrs from './data/zeneca/attrs.json';
import zenecaTriples from './data/zeneca/triples.json';
import uuid from '../../src/utils/id';
import { weakHash } from '../../src';

// After a local write, the Reactor re-runs only the queries the write can
// affect. Most tests here run each scenario twice, with `_scopedNotify` on and
// off, and check that every subscriber received the identical sequence of
// payloads both ways, and which queries were recomputed.

// ---------------------------------------------------------------------------
// Fixtures

/** Deterministic uuids, so two reactors built from one spec share ids. */
function idFactory(prefix) {
  let n = 0;
  return () => {
    const hex = (n++).toString(16).padStart(12, '0');
    return `${prefix.padEnd(8, '0').slice(0, 8)}-0000-4000-8000-${hex}`;
  };
}

const nextAttrId = idFactory('a0000000');

function idAttr(etype) {
  return {
    id: nextAttrId(),
    'forward-identity': [nextAttrId(), etype, 'id'],
    'value-type': 'blob',
    cardinality: 'one',
    'unique?': true,
    'index?': false,
    'primary?': true,
  };
}

function blobAttr(etype, label, extra = {}) {
  return {
    id: nextAttrId(),
    'forward-identity': [nextAttrId(), etype, label],
    'value-type': 'blob',
    cardinality: 'one',
    'unique?': false,
    'index?': false,
    ...extra,
  };
}

function refAttr([fwdEtype, fwdLabel], [revEtype, revLabel], cardinality) {
  return {
    id: nextAttrId(),
    'forward-identity': [nextAttrId(), fwdEtype, fwdLabel],
    'reverse-identity': [nextAttrId(), revEtype, revLabel],
    'value-type': 'ref',
    cardinality,
    'unique?': false,
    'index?': false,
  };
}

const ATTRS = [
  idAttr('A'),
  blobAttr('A', 'x'),
  blobAttr('A', 'y'),
  blobAttr('A', 'z', { 'unique?': true, 'index?': true }),
  blobAttr('A', 'meta'),
  idAttr('B'),
  blobAttr('B', 'name'),
  blobAttr('B', 'deletedAt'),
  idAttr('$users'),
  blobAttr('$users', 'email', { 'unique?': true, 'index?': true }),
  refAttr(['A', 'bs'], ['B', 'as'], 'many'),
  refAttr(['A', 'owner'], ['B', 'owned'], 'one'),
  refAttr(['B', 'user'], ['$users', 'bs'], 'one'),
  // An etype whose primary key is not the attribute labelled `id`.
  { ...blobAttr('P', 'pk', { 'unique?': true }), 'primary?': true },
  blobAttr('P', 'id'),
  blobAttr('P', 'v'),
];

function attrIdOf(etype, label) {
  const attr = ATTRS.find(
    (a) =>
      a['forward-identity'][1] === etype && a['forward-identity'][2] === label,
  );
  if (!attr) throw new Error(`no attr ${etype}.${label}`);
  return attr.id;
}

function entityTriples(etype, id, values = {}) {
  return [
    [id, attrIdOf(etype, 'id'), id, 1],
    ...Object.entries(values).map(([label, v]) => [
      id,
      attrIdOf(etype, label),
      v,
      1,
    ]),
  ];
}

function linkTriple(etype, label, from, to) {
  return [from, attrIdOf(etype, label), to, 1];
}

const eid = idFactory('e0000000');
const [A0, A1, A2, B0, B1, B2, U0, U1] = Array.from({ length: 8 }, eid);

const TRIPLES = [
  ...entityTriples('A', A0, { x: 0, y: 0, z: 'z0', meta: { k: 0 } }),
  ...entityTriples('A', A1, { x: 1, y: 1, z: 'z1', meta: { k: 1 } }),
  ...entityTriples('A', A2, { x: 2, y: 2, z: 'z2', meta: { k: 2 } }),
  ...entityTriples('B', B0, { name: 'b0' }),
  ...entityTriples('B', B1, { name: 'b1' }),
  ...entityTriples('B', B2, { name: 'b2', deletedAt: 5 }),
  ...entityTriples('$users', U0, { email: 'u0@x' }),
  ...entityTriples('$users', U1, { email: 'u1@x' }),
  linkTriple('A', 'bs', A0, B0),
  linkTriple('A', 'owner', A1, B1),
  linkTriple('B', 'user', B0, U0),
  linkTriple('B', 'user', B1, U1),
];

const attrsMap = (attrs) => Object.fromEntries(attrs.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// A real Reactor, with every delivery and recompute recorded

async function waitForLoaded(reactor) {
  await reactor.querySubs.waitForMetaToLoad();
  await reactor.kv.waitForMetaToLoad();
  await reactor.kv.waitForKeyToLoad('pendingMutations');
  await reactor.querySubs.flush();
  await reactor.kv.flush();
}

class Harness {
  reactor;
  /** Every payload delivered to each hash's subscriber. */
  deliveries = new Map();
  notifyOne;
  applyOptimisticUpdates;

  static async create({ scoped, attrs = ATTRS }) {
    const h = new Harness();
    const reactor = new Reactor({ appId: uuid() });
    reactor._initStorage(IndexedDBStorage);
    reactor._setAttrs(attrs);
    reactor._scopedNotify = scoped;
    h.reactor = reactor;
    await waitForLoaded(reactor);
    h.notifyOne = vi.spyOn(reactor, 'notifyOne');
    h.applyOptimisticUpdates = vi.spyOn(reactor, '_applyOptimisticUpdates');
    return h;
  }

  /** Subscribes `q`, and delivers it a server result of `triples`. */
  async subscribe(q, triples = TRIPLES, opts?) {
    const delivered: any[] = [];
    this.reactor.subscribeQuery(
      q,
      (data) => delivered.push(structuredClone(data)),
      opts,
    );
    const fullQ =
      opts && 'ruleParams' in opts
        ? { $$ruleParams: opts.ruleParams, ...q }
        : q;
    const hash = weakHash(fullQ);
    this.deliveries.set(hash, delivered);
    this.reactor._handleReceive(0, {
      op: 'add-query-ok',
      q: fullQ,
      'processed-tx-id': 0,
      result: [
        {
          data: {
            'datalog-result': { 'join-rows': [triples.map((t) => [...t])] },
          },
          'child-nodes': [],
        },
      ],
    });
    await this.flush();
    return hash;
  }

  write(chunks) {
    this.reactor.pushTx(chunks).catch(() => {});
  }

  /** A local write of raw tx-steps, as `pushOps` receives them. */
  writeSteps(steps) {
    this.reactor.pushOps(steps).catch(() => {});
  }

  /** Pending mutation event ids, in the order the Reactor applies them. */
  pendingEventIds() {
    return [...this.reactor._pendingMutations().entries()]
      .sort(([ka, a], [kb, b]) =>
        (a.order || 0) === (b.order || 0)
          ? ka < kb
            ? -1
            : ka > kb
              ? 1
              : 0
          : (a.order || 0) - (b.order || 0),
      )
      .map(([k]) => k);
  }

  /** The server rejects, or the client times out, the `index`th pending mutation. */
  reject(index, status = 'error') {
    const eventId = this.pendingEventIds()[index];
    if (!eventId) return;
    // The write's promise already resolved as `enqueued`, so the reactor
    // logs the failure for want of a listener.
    const error = console.error;
    console.error = () => {};
    try {
      this.reactor._handleMutationError(status, eventId, {
        message: 'rejected in test',
      });
    } finally {
      console.error = error;
    }
  }

  /**
   * Waits until the reactor is quiet. A notify is delivered through
   * `querySubs.waitForKeyToLoad(hash).then(...)`, which can resolve after
   * a single tick when storage is slow, so wait for the persisted objects to
   * flush and for the notify count to hold still across several ticks.
   */
  async flush() {
    let last = -1;
    let quietTicks = 0;
    for (let i = 0; i < 100 && quietTicks < 3; i++) {
      await this.reactor.querySubs.flush();
      await this.reactor.kv.flush();
      await sleep(0);
      const n = this.notifyOne.mock.calls.length;
      quietTicks = n === last ? quietTicks + 1 : 0;
      last = n;
    }
  }

  resetCounts() {
    this.notifyOne.mockClear();
    this.applyOptimisticUpdates.mockClear();
  }

  recomputes(hash) {
    return this.notifyOne.mock.calls.filter(([h]) => h === hash).length;
  }

  lastDelivered(hash) {
    return this.deliveries.get(hash).at(-1);
  }

  /** A fresh evaluation of `hash` over its store with every pending mutation applied. */
  truth(hash) {
    const { q, result } = this.reactor.querySubs.currentValue[hash];
    const muts = this.reactor._rewriteMutationsSorted(
      result.attrsStore,
      this.reactor._pendingMutations(),
    );
    const { store, attrsStore } =
      Reactor.prototype._applyOptimisticUpdates.call(
        this.reactor,
        result.store,
        result.attrsStore,
        muts,
        result.processedTxId,
      );
    return structuredClone(
      instaql(
        {
          store,
          attrsStore,
          pageInfo: result.pageInfo,
          aggregate: result.aggregate,
        },
        q,
      ),
    );
  }
}

/**
 * Runs `act` against a scoped and an unscoped reactor with the same queries,
 * and asserts that every subscriber saw the identical payload sequence both
 * ways, ending on the true data.
 */
async function bothWays(queries, act) {
  const run = async (scoped) => {
    const h = await Harness.create({ scoped });
    const hash = {};
    for (const [name, q] of Object.entries(queries)) {
      hash[name] = await h.subscribe(q);
    }
    h.resetCounts();
    await act(h);
    await h.flush();
    return { h, hash };
  };
  const s = await run(true);
  const u = await run(false);
  for (const name of Object.keys(queries)) {
    expect(
      s.h.deliveries.get(s.hash[name]),
      `${name}: scoped deliveries differ from unscoped`,
    ).toEqual(u.h.deliveries.get(u.hash[name]));
    expect(
      s.h.lastDelivered(s.hash[name]),
      `${name}: scoped data is not the true data`,
    ).toEqual(s.h.truth(s.hash[name]));
  }
  const recomputed = (h) =>
    Object.keys(queries)
      .filter((name) => h.recomputes(s.hash[name]) > 0)
      .sort();
  return {
    scoped: s.h,
    unscoped: u.h,
    hash: s.hash,
    recomputed: recomputed(s.h),
    unscopedRecomputed: recomputed(u.h),
  };
}

// ---------------------------------------------------------------------------
// The classifier

describe('notifyScope footprints', () => {
  const attrs = new AttrsStoreClass(attrsMap(ATTRS), null);
  const serverStore = createStore(
    new AttrsStoreClass(attrsMap(ATTRS), null),
    TRIPLES as any,
    true,
    false,
  );

  /** The tx-steps the client builds for `chunks`, with A0...U1 in its store. */
  const steps = (chunks): any[] =>
    instaml.transform({ attrsStore: attrs, stores: [serverStore] }, chunks);
  const writeKeys = (chunks) => {
    const fp = mutationFootprint(steps(chunks), attrs);
    return (
      fp &&
      Object.fromEntries(
        [...fp].map(([k, v]) => [
          k,
          v.eids === true ? 'ANY' : [...v.eids].sort(),
        ]),
      )
    );
  };
  const queryFp = (q) => {
    const fp = queryFootprint(q, attrs);
    return (
      fp && {
        keys: [...fp.keys].sort(),
        wild: [...fp.wild].sort(),
        pins: Object.fromEntries(
          [...fp.pins].map(([k, v]) => [k, [...v].sort()]),
        ),
      }
    );
  };
  const intersects = (chunks, q) => {
    const w = mutationFootprint(steps(chunks), attrs);
    const qf = queryFootprint(q, attrs);
    if (!w || !qf) throw new Error('expected both footprints to classify');
    return footprintsIntersect(w, qf);
  };

  describe('of a write', () => {
    test("an update of an existing entity is its attributes only: the mode:'update' id triple changes nothing", () => {
      expect(steps(tx.A[A0].update({ x: 5 }))[0][4]).toEqual({
        mode: 'update',
      });
      expect(writeKeys(tx.A[A0].update({ x: 5 }))).toEqual({ 'a|A|x': [A0] });
    });

    test('an update of an entity the client does not hold is an upsert, so a membership change', () => {
      const fresh = eid();
      expect(writeKeys(tx.A[fresh].update({ x: 5 }))).toEqual({
        'm|A': [fresh],
        'a|A|id': [fresh],
        'a|A|x': [fresh],
      });
    });

    test('a create is a membership change', () => {
      const fresh = eid();
      expect(writeKeys(tx.A[fresh].create({ y: 1 }))).toEqual({
        'm|A': [fresh],
        'a|A|id': [fresh],
        'a|A|y': [fresh],
      });
    });

    test('a merge is the merged attribute', () => {
      expect(writeKeys(tx.A[A0].merge({ meta: { k: 9 } }))).toMatchObject({
        'a|A|meta': [A0],
      });
    });

    test('a link or unlink is the ref attribute under both its names, for any entity', () => {
      const expected = { 'r|A|bs': 'ANY', 'r|B|as': 'ANY' };
      expect(writeKeys(tx.A[A0].link({ bs: B1 }))).toEqual(expected);
      expect(writeKeys(tx.A[A0].unlink({ bs: B0 }))).toEqual(expected);
      // Written from the reverse side: the same pair of names.
      expect(writeKeys(tx.B[B1].link({ as: A2 }))).toEqual(expected);
    });

    test('a lookup matches any entity', () => {
      const keys = writeKeys(tx.A[lookup('z', 'z1')].update({ x: 3 }));
      expect(keys?.['a|A|x']).toBe('ANY');
    });

    test('rule-params steps change nothing', () => {
      expect(
        mutationFootprint([['rule-params', A0, 'A', { k: 1 }]], attrs),
      ).toEqual(new Map());
    });

    test('a write to a non-`id` primary key, or to the attribute labelled `id`, is a membership change', () => {
      const pk = attrIdOf('P', 'pk');
      const idLabelled = attrIdOf('P', 'id');
      const p = eid();
      const keys = (step) => [
        ...(mutationFootprint([step], attrs)?.keys() ?? []),
      ];
      expect(keys(['add-triple', p, pk, p])).toContain('m|P');
      expect(keys(['add-triple', p, idLabelled, p])).toContain('m|P');
      // mode:'update' is skipped only on the primary key itself.
      expect(keys(['add-triple', p, pk, p, { mode: 'update' }])).toEqual([]);
      expect(
        keys(['add-triple', p, idLabelled, p, { mode: 'update' }]),
      ).toContain('m|P');
    });

    test.each([
      ['delete-entity', () => steps(tx.A[A0].delete())],
      ['add-attr', () => steps(tx.A[A0].update({ brandNew: 1 }))],
      ['update-attr', () => [['update-attr', { id: attrIdOf('A', 'x') }]]],
      ['delete-attr', () => [['delete-attr', attrIdOf('A', 'x')]]],
      ['restore-attr', () => [['restore-attr', attrIdOf('A', 'x')]]],
      [
        'an attribute id the client does not know',
        () => [['add-triple', A0, uuid(), 1]],
      ],
      ['an unrecognised action', () => [['frobnicate', A0]]],
    ])('%s is unknown', (_name, makeSteps) => {
      expect(mutationFootprint(makeSteps(), attrs)).toBeNull();
    });

    test('is unknown before the client has attrs', () => {
      expect(
        mutationFootprint(steps(tx.A[A0].update({ x: 1 })), undefined),
      ).toBeNull();
    });
  });

  describe('of a query', () => {
    test('reads membership, `fields` and id, and no wildcard', () => {
      expect(queryFp({ A: { $: { fields: ['x'] } } })).toEqual({
        keys: ['a|A|id', 'a|A|x', 'm|A'],
        wild: [],
        pins: {},
      });
    });

    test('reads every blob attribute when it has no `fields`', () => {
      expect(queryFp({ A: {} })).toEqual({
        keys: ['m|A'],
        wild: ['A'],
        pins: {},
      });
    });

    test('adds a nested label’s ref and the next level, forward and reverse', () => {
      const fwd = queryFp({ A: { $: { fields: ['x'] }, bs: {} } });
      expect(fwd?.keys).toEqual(expect.arrayContaining(['r|A|bs', 'm|B']));
      expect(fwd?.wild).toEqual(['B']);
      expect(queryFp({ B: { as: { $: { fields: ['y'] } } } })?.keys).toEqual(
        expect.arrayContaining(['r|B|as', 'm|A', 'a|A|y']),
      );
    });

    test('adds filtered attributes, dotted paths, $isNull, $not and and/or clauses', () => {
      const fp = queryFp({
        B: {
          $: {
            fields: ['name'],
            where: {
              deletedAt: { $isNull: true },
              'user.email': 'u0@x',
              or: [{ name: { $not: 'b0' } }, { and: [{ 'as.y': { $gt: 1 } }] }],
            },
          },
        },
      });
      expect(fp?.keys).toEqual(
        expect.arrayContaining([
          'a|B|deletedAt',
          'r|B|user',
          'm|$users',
          'a|$users|email',
          'a|B|name',
          'r|B|as',
          'm|A',
          'a|A|y',
        ]),
      );
    });

    test('a filter on a ref label reads the ref and the other side’s membership', () => {
      expect(
        queryFp({ A: { $: { fields: ['x'], where: { owner: B1 } } } })?.keys,
      ).toEqual(expect.arrayContaining(['r|A|owner', 'm|B']));
    });

    test.each([
      ['order', { A: { $: { order: { x: 'asc' } } } }],
      ['limit', { A: { $: { limit: 2 } } }],
      ['first', { A: { $: { first: 2 } } }],
      ['offset', { A: { $: { offset: 1 } } }],
      ['aggregate', { A: { $: { aggregate: 'count' } } }],
      ['$$ruleParams', { $$ruleParams: { k: 1 }, A: {} }],
      [
        'an unknown where operator',
        { A: { $: { where: { x: { $foo: 1 } } } } },
      ],
      ['an unknown where label', { A: { $: { where: { nope: 1 } } } }],
      ['an unknown nested label', { A: { nope: {} } }],
      ['a nested blob label', { A: { x: {} } }],
      ['a dotted path through a blob', { A: { $: { where: { 'x.y': 1 } } } }],
      ['a non-array or', { A: { $: { where: { or: { x: 1 } } } } }],
      ['non-array fields', { A: { $: { fields: 'x' } } }],
    ])('%s is unknown', (_name, q) => {
      expect(queryFootprint(q, attrs)).toBeNull();
    });

    test('is unknown before the client has attrs', () => {
      expect(queryFootprint({ A: {} }, undefined)).toBeNull();
    });

    test('pins a top-level etype filtered by `id` or `id: {$in}`', () => {
      expect(queryFp({ A: { $: { where: { id: A0 } } } })?.pins).toEqual({
        A: [A0],
      });
      expect(
        queryFp({
          A: { $: { where: { id: { $in: [A2, A1] } }, fields: ['x'] }, bs: {} },
        })?.pins,
      ).toEqual({ A: [A1, A2].sort() });
    });

    test('does not pin an etype read elsewhere in the query, a nested level, or a non-plain id filter', () => {
      expect(
        queryFp({ A: { $: { where: { id: A0 } }, bs: { as: {} } } })?.pins,
      ).toEqual({});
      expect(
        queryFp({ A: { $: { where: { id: A0, 'bs.as.x': 1 } } } })?.pins,
      ).toEqual({});
      expect(
        queryFp({ B: { as: { $: { where: { id: A0 } } } } })?.pins,
      ).toEqual({});
      expect(
        queryFp({ A: { $: { where: { id: { $not: A0 } } } } })?.pins,
      ).toEqual({});
      expect(
        queryFp({ A: { $: { where: { or: [{ id: A0 }] } } } })?.pins,
      ).toEqual({});
    });
  });

  describe('intersection', () => {
    test('a write to type A misses a query that reads only type B', () => {
      expect(intersects(tx.A[A0].update({ x: 1 }), { B: {} })).toBe(false);
    });

    test('a write outside `fields` misses; inside, or with no fields, hits', () => {
      const fieldsX = { A: { $: { fields: ['x'] } } };
      expect(intersects(tx.A[A0].update({ y: 1 }), fieldsX)).toBe(false);
      expect(intersects(tx.A[A0].update({ x: 1 }), fieldsX)).toBe(true);
      expect(intersects(tx.A[A0].update({ y: 1 }), { A: {} })).toBe(true);
    });

    test('a write to a filtered attribute hits even when it is not in `fields`', () => {
      expect(
        intersects(tx.A[A0].update({ y: 1 }), {
          A: { $: { fields: ['x'], where: { y: 1 } } },
        }),
      ).toBe(true);
    });

    test('a link hits every query reading the link, from either side, and misses plain reads of its types', () => {
      const link = tx.A[A0].link({ bs: B1 });
      expect(intersects(link, { A: { bs: {} } })).toBe(true);
      expect(intersects(link, { B: { as: {} } })).toBe(true);
      expect(intersects(link, { $users: { bs: { as: {} } } })).toBe(true);
      expect(intersects(link, { B: { $: { where: { 'as.x': 1 } } } })).toBe(
        true,
      );
      expect(intersects(link, { A: {} })).toBe(false);
      expect(intersects(link, { B: {} })).toBe(false);
      expect(intersects(link, { A: { owner: {} } })).toBe(false);
    });

    test('a pinned query misses writes to other entities of its type, and hits its own and every link', () => {
      const pinned = { A: { $: { where: { id: A0 } }, bs: {} } };
      expect(intersects(tx.A[A1].update({ x: 1 }), pinned)).toBe(false);
      expect(intersects(tx.A[eid()].update({ x: 1 }), pinned)).toBe(false);
      expect(intersects(tx.A[A0].update({ x: 1 }), pinned)).toBe(true);
      expect(intersects(tx.A[A1].link({ bs: B1 }), pinned)).toBe(true);
      expect(intersects(tx.A[lookup('z', 'z1')].update({ x: 1 }), pinned)).toBe(
        true,
      );
      expect(intersects(tx.B[B0].update({ name: 'n' }), pinned)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// The Reactor

describe('scoped notify after a local write', () => {
  test('is on by default', () => {
    expect(new Reactor({ appId: uuid() })._scopedNotify).toBe(true);
  });

  test('a write to type A does not recompute a query on type B', async () => {
    const r = await bothWays(
      { onA: { A: { $: { fields: ['x'] } } }, onB: { B: {} } },
      (h) => h.write(tx.A[A0].update({ x: 5 })),
    );
    expect(r.recomputed).toEqual(['onA']);
    expect(r.unscopedRecomputed).toEqual(['onA', 'onB']);
    // The skipped query re-applied no pending mutations.
    expect(r.scoped.applyOptimisticUpdates).toHaveBeenCalledTimes(1);
    expect(r.unscoped.applyOptimisticUpdates).toHaveBeenCalledTimes(2);
    expect(r.scoped.lastDelivered(r.hash.onA)).toMatchObject({
      data: { A: expect.arrayContaining([{ id: A0, x: 5 }]) },
    });
  });

  test('a write outside a query’s fields and filters does not recompute it', async () => {
    const r = await bothWays(
      {
        fieldsX: { A: { $: { fields: ['x'] } } },
        filtersY: { A: { $: { fields: ['x'], where: { y: 9 } } } },
        wildcard: { A: {} },
      },
      (h) => h.write(tx.A[A0].update({ y: 9 })),
    );
    expect(r.recomputed).toEqual(['filtersY', 'wildcard']);
  });

  test('a link recomputes the queries that read it, on both types and from either side', async () => {
    const r = await bothWays(
      {
        aToBs: { A: { $: { fields: ['x'] }, bs: { $: { fields: ['name'] } } } },
        bToAs: { B: { $: { fields: ['name'] }, as: { $: { fields: ['x'] } } } },
        plainA: { A: { $: { fields: ['x'] } } },
        plainB: { B: { $: { fields: ['name'] } } },
        owner: { A: { owner: {} } },
      },
      (h) => h.write(tx.A[A0].link({ bs: B1 })),
    );
    // instaql reads a link only through its ref attribute, so plain reads of
    // A and B cannot see it.
    expect(r.recomputed).toEqual(['aToBs', 'bToAs']);
  });

  test('an unlink, and a has-one relink that implicitly drops the old value', async () => {
    const r = await bothWays(
      {
        aToBs: { A: { bs: {} } },
        owned: { B: { owned: {} } },
        plainB: { B: {} },
      },
      async (h) => {
        h.write(tx.A[A0].unlink({ bs: B0 }));
        await h.flush();
        h.write(tx.A[A1].link({ owner: B2 }));
      },
    );
    expect(r.recomputed).toEqual(['aToBs', 'owned']);
  });

  test('delete-entity recomputes every query', async () => {
    const r = await bothWays(
      {
        onA: { A: { $: { fields: ['x'] } } },
        onB: { B: {} },
        linked: { B: { as: {} } },
      },
      (h) => h.write(tx.A[A0].delete()),
    );
    expect(r.recomputed).toEqual(['linked', 'onA', 'onB']);
  });

  test('creating an entity recomputes every unpinned query on its type, whatever its fields', async () => {
    const fresh = eid();
    const r = await bothWays(
      {
        fieldsY: { A: { $: { fields: ['y'] } } },
        onB: { B: {} },
        pinned: { A: { $: { where: { id: A0 } } } },
      },
      (h) => h.write(tx.A[fresh].update({ x: 1 })),
    );
    expect(r.recomputed).toEqual(['fieldsY']);
  });

  test('a pinned query recomputes for its own entity and skips the others', async () => {
    const r = await bothWays(
      {
        pinA0: { A: { $: { where: { id: A0 } } } },
        pinA1: { A: { $: { where: { id: { $in: [A1] } } } } },
      },
      (h) => h.write(tx.A[A0].update({ x: 7 })),
    );
    expect(r.recomputed).toEqual(['pinA0']);
  });

  test('a pinned query recomputes for a link written from the other side', async () => {
    // `B.user` is forward on B, so the step's eid is B2 and U0 is only its
    // value: a pin must never discount a ref step.
    const r = await bothWays(
      {
        pinU0: {
          $users: { $: { where: { id: U0 } }, bs: { $: { fields: ['name'] } } },
        },
      },
      (h) => h.write(tx.B[B2].link({ user: U0 })),
    );
    expect(r.recomputed).toEqual(['pinU0']);
    expect(r.scoped.lastDelivered(r.hash.pinU0)).toMatchObject({
      data: {
        $users: [
          { id: U0, bs: expect.arrayContaining([{ id: B2, name: 'b2' }]) },
        ],
      },
    });
  });

  test('a dotted filter recomputes when the far attribute changes', async () => {
    const r = await bothWays(
      {
        byEmail: {
          B: { $: { fields: ['name'], where: { 'user.email': 'new@x' } } },
        },
        bName: { B: { $: { fields: ['name'] } } },
      },
      (h) => h.write(tx.$users[U1].update({ email: 'new@x' })),
    );
    expect(r.recomputed).toEqual(['byEmail']);
    expect(r.scoped.lastDelivered(r.hash.byEmail)).toEqual({
      data: { B: [{ id: B1, name: 'b1' }] },
    });
  });

  test('a ruleParams query recomputes on any write', async () => {
    const run = async (scoped) => {
      const h = await Harness.create({ scoped });
      const rp = await h.subscribe({ A: { $: { fields: ['x'] } } }, TRIPLES, {
        ruleParams: { k: 1 },
      });
      const onA = await h.subscribe({ A: { $: { fields: ['x'] } } });
      h.resetCounts();
      h.write(tx.B[B0].update({ name: 'n' }));
      await h.flush();
      return { rp: h.recomputes(rp), onA: h.recomputes(onA) };
    };
    expect(await run(true)).toEqual({ rp: 1, onA: 0 });
    expect(await run(false)).toEqual({ rp: 1, onA: 1 });
  });

  test.each([
    [
      'a new attribute (add-attr)',
      (h) => h.write(tx.B[B0].update({ brandNew: 1 })),
    ],
    [
      'update-attr',
      (h) => h.writeSteps([['update-attr', { id: attrIdOf('B', 'name') }]]),
    ],
    [
      'restore-attr',
      (h) => h.writeSteps([['restore-attr', attrIdOf('B', 'name')]]),
    ],
    [
      'an attribute id the client does not know',
      (h) => h.writeSteps([['add-triple', B0, uuid(), 1]]),
    ],
  ])('%s recomputes every query', async (_name, act) => {
    const r = await bothWays(
      {
        onA: { A: { $: { fields: ['x'] } } },
        onB: { B: { $: { fields: ['name'] } } },
      },
      act,
    );
    expect(r.recomputed).toEqual(['onA', 'onB']);
  });

  test('a mutation whose attribute id the client rewrites recomputes every query, and shows the write', async () => {
    const xAttr = ATTRS.find((a) => a.id === attrIdOf('A', 'x'));
    const localId = uuid();
    const r = await bothWays(
      { onA: { A: { $: { fields: ['x'] } } }, onB: { B: {} } },
      (h) =>
        // A locally created attr the server already has under another id.
        h.writeSteps([
          ['add-attr', { ...xAttr, id: localId }],
          ['add-triple', A0, localId, 42],
        ]),
    );
    expect(r.recomputed).toEqual(['onA', 'onB']);
    expect(r.scoped.lastDelivered(r.hash.onA)).toMatchObject({
      data: { A: expect.arrayContaining([{ id: A0, x: 42 }]) },
    });
  });

  test('the deep-compare still gates callbacks', async () => {
    const r = await bothWays(
      { onA: { A: { $: { fields: ['x'] } } }, onB: { B: {} } },
      // The value it already has.
      (h) => h.write(tx.A[A0].update({ x: 0 })),
    );
    expect(r.recomputed).toEqual(['onA']);
    // Only the first delivery, from subscribing.
    expect(r.scoped.deliveries.get(r.hash.onA)).toHaveLength(1);
    expect(r.scoped.deliveries.get(r.hash.onB)).toHaveLength(1);
  });

  test.each(['error', 'timeout'])(
    'a rejected write (%s) recomputes what it touched and rolls back',
    async (status) => {
      const r = await bothWays(
        { onA: { A: { $: { fields: ['x'] } } }, onB: { B: {} } },
        async (h) => {
          h.write(tx.A[A0].update({ x: 5 }));
          await h.flush();
          h.resetCounts();
          h.reject(0, status);
        },
      );
      expect(r.recomputed).toEqual(['onA']);
      const xs = r.scoped.deliveries
        .get(r.hash.onA)
        .map((d) => d.data.A.find((a) => a.id === A0).x);
      expect(xs).toEqual([0, 5, 0]);
    },
  );

  test('rejecting a write also recomputes what the later pending writes touch', async () => {
    const r = await bothWays(
      {
        fieldsY: { A: { $: { fields: ['y'] } } },
        pinnedA1: { A: { $: { where: { id: A1 }, fields: ['y'] } } },
        onB: { B: {} },
      },
      async (h) => {
        h.write(tx.A[A1].update({ z: 'k' }));
        // Resolves its lookup against the write above.
        h.write(tx.A[lookup('z', 'k')].update({ y: 3 }));
        await h.flush();
        h.resetCounts();
        h.reject(0);
      },
    );
    expect(r.recomputed).toEqual(['fieldsY', 'pinnedA1']);
  });

  test('a write that fails to build recomputes nothing already delivered', async () => {
    const r = await bothWays({ onA: { A: {} } }, (h) => {
      h.reactor.pushOps([], new Error('bad tx')).catch(() => {});
    });
    expect(r.recomputed).toEqual([]);
  });

  test('several writes in one tick recompute the union of what they touch', async () => {
    const r = await bothWays(
      {
        fieldsX: { A: { $: { fields: ['x'] } } },
        fieldsY: { A: { $: { fields: ['y'] } } },
        onB: { B: { $: { fields: ['name'] } } },
      },
      (h) => {
        h.write(tx.A[A0].update({ x: 1 }));
        h.write(tx.B[B0].update({ name: 'n' }));
        h.write(tx.A[A1].update({ x: 9 }));
      },
    );
    expect(r.recomputed).toEqual(['fieldsX', 'onB']);
  });

  test('a query subscribed after writes computes with every pending write, and is then scoped', async () => {
    for (const scoped of [true, false]) {
      const h = await Harness.create({ scoped });
      await h.subscribe({ B: {} });
      h.write(tx.A[A0].update({ x: 11 }));
      await h.flush();
      const late = await h.subscribe({ A: { $: { fields: ['x'] } } });
      expect(h.lastDelivered(late)).toEqual(h.truth(late));
      expect(h.lastDelivered(late)).toMatchObject({
        data: { A: expect.arrayContaining([{ id: A0, x: 11 }]) },
      });
      h.resetCounts();
      h.write(tx.B[B0].update({ name: 'n' }));
      await h.flush();
      expect(h.recomputes(late) > 0).toBe(!scoped);
      expect(h.lastDelivered(late)).toEqual(h.truth(late));
    }
  });

  test('a query cleared by notifyQueryError is re-delivered by the next write', async () => {
    const r = await bothWays({ onA: { A: { $: { fields: ['x'] } } } }, (h) => {
      h.reactor.notifyQueryError(
        weakHash({ A: { $: { fields: ['x'] } } }),
        'boom',
      );
      h.write(tx.B[B0].update({ name: 'n' }));
    });
    expect(r.recomputed).toEqual(['onA']);
    const d = r.scoped.deliveries.get(r.hash.onA);
    expect(d).toHaveLength(3);
    expect(d[1]).toEqual({ error: 'boom' });
    expect(d[2]).toEqual(d[0]);
  });

  test('notifyAll is unchanged: it recomputes every query', async () => {
    const r = await bothWays({ onA: { A: {} }, onB: { B: {} } }, (h) =>
      h.reactor.notifyAll(),
    );
    expect(r.recomputed).toEqual(['onA', 'onB']);
  });

  test('caches a query footprint while its form and the attrs are unchanged, and drops it on cleanup', async () => {
    const h = await Harness.create({ scoped: true });
    const q = { A: { $: { fields: ['x'] } } };
    const hash = await h.subscribe(q);
    h.write(tx.B[B0].update({ name: 'n' }));
    const first = h.reactor._queryFootprints.get(hash);
    expect(first.fp).not.toBeNull();
    h.write(tx.B[B0].update({ name: 'm' }));
    expect(h.reactor._queryFootprints.get(hash)).toBe(first);

    h.reactor._setAttrs(ATTRS);
    h.write(tx.B[B0].update({ name: 'o' }));
    const second = h.reactor._queryFootprints.get(hash);
    expect(second).not.toBe(first);
    expect(second.attrs).toBe(h.reactor.attrs);

    h.reactor.queryCbs[hash] = [];
    h.reactor._cleanupQuery(q, hash);
    expect(h.reactor._queryFootprints.has(hash)).toBe(false);
    await h.flush();
  });

  test('zeneca: a write to users skips a bookshelves query', async () => {
    const joeId = 'ce942051-2d74-404a-9c7d-4aa3f2d54ae4';
    const run = async (scoped) => {
      const h = await Harness.create({ scoped, attrs: zenecaAttrs });
      const users = await h.subscribe({ users: {} }, zenecaTriples);
      const shelves = await h.subscribe({ bookshelves: {} }, zenecaTriples);
      h.resetCounts();
      h.write(tx.users[joeId].update({ handle: 'joe2' }));
      await h.flush();
      expect(
        h.lastDelivered(users).data.users.find((u) => u.id === joeId).handle,
      ).toBe('joe2');
      return { users: h.recomputes(users), shelves: h.recomputes(shelves) };
    };
    expect(await run(true)).toEqual({ users: 1, shelves: 0 });
    expect(await run(false)).toEqual({ users: 1, shelves: 1 });
  });
});

// ---------------------------------------------------------------------------
// Seeded fuzz

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('scoped notify, seeded fuzz', () => {
  const QUERIES = {
    wildA: { A: {} },
    fieldsX: { A: { $: { fields: ['x'] } } },
    liveB: {
      B: { $: { where: { deletedAt: { $isNull: true } }, fields: ['name'] } },
    },
    nested: { A: { $: { fields: ['y'] }, bs: { $: { fields: ['name'] } } } },
    reverse: { B: { as: {} } },
    pinned: {
      A: { $: { where: { id: A0 } }, owner: { $: { fields: ['name'] } } },
    },
    pinnedIn: {
      A: { $: { where: { id: { $in: [A1, A2] } }, fields: ['meta'] } },
    },
    // Pinned on the value side of `B.user`, so B-side link writes reach it
    // with a B eid.
    pinnedUser: {
      $users: { $: { where: { id: U0 } }, bs: { $: { fields: ['name'] } } },
    },
    dotted: { B: { $: { where: { 'user.email': 'u1@x' }, fields: ['name'] } } },
    notName: {
      B: { $: { where: { name: { $not: 'b0' } }, fields: ['deletedAt'] } },
    },
    users: { $users: { bs: { $: { fields: ['name'] } } } },
    byLookupAttr: { A: { $: { where: { z: 'k' }, fields: ['y'] } } },
  };

  it('matches unscoped notify and the true data after every step of 200 random writes and rejections', async () => {
    const run = async (scoped) => {
      const rand = mulberry32(42);
      const pick = (xs) => xs[Math.floor(rand() * xs.length)];
      const ids = idFactory('f0000000');
      const as = [A0, A1, A2];
      const bs = [B0, B1, B2];
      const us = [U0, U1];
      const h = await Harness.create({ scoped });
      // Each query's store holds a random subset of the server's entities,
      // always including the ones it pins.
      const PINNED = { pinned: [A0], pinnedIn: [A1, A2], pinnedUser: [U0] };
      const hash = {};
      for (const [name, q] of Object.entries(QUERIES)) {
        const keep = new Set(
          [...as, ...bs, ...us].filter(
            (e) => rand() < 0.8 || PINNED[name]?.includes(e),
          ),
        );
        hash[name] = await h.subscribe(
          q,
          TRIPLES.filter(
            ([e, , v]) =>
              keep.has(e) &&
              (typeof v !== 'string' ||
                !v.startsWith('e0000000') ||
                keep.has(v)),
          ),
        );
      }
      const snapshots: number[][] = [];
      let recomputes = 0;
      for (let step = 0; step < 200; step++) {
        h.resetCounts();
        const r = rand();
        const n = () => Math.floor(rand() * 3);
        if (r < 0.15) h.write(tx.A[pick(as)].update({ x: n() }));
        else if (r < 0.25) h.write(tx.A[pick(as)].update({ y: n() }));
        else if (r < 0.3) h.write(tx.A[pick(as)].merge({ meta: { k: n() } }));
        else if (r < 0.4)
          h.write(tx.B[pick(bs)].update({ name: pick(['b0', 'b1', 'n']) }));
        else if (r < 0.45)
          h.write(tx.B[pick(bs)].update({ deletedAt: pick([null, 7]) }));
        else if (r < 0.5)
          h.write(
            tx.$users[pick(us)].update({
              email: pick(['u0@x', 'u1@x', 'v@x']),
            }),
          );
        else if (r < 0.55) {
          const a = ids();
          as.push(a);
          h.write(tx.A[a].update({ x: 1, y: 1 }).link({ bs: pick(bs) }));
        } else if (r < 0.58) {
          const b = ids();
          bs.push(b);
          h.write(tx.B[b].update({ name: 'new' }).link({ user: pick(us) }));
        } else if (r < 0.66) h.write(tx.A[pick(as)].link({ bs: pick(bs) }));
        else if (r < 0.7) h.write(tx.A[pick(as)].unlink({ bs: pick(bs) }));
        else if (r < 0.74) h.write(tx.A[pick(as)].link({ owner: pick(bs) }));
        else if (r < 0.77) h.write(tx.B[pick(bs)].link({ user: pick(us) }));
        else if (r < 0.8)
          h.write(tx.A[pick(as)].update({ z: pick(['k', 'z1']) }));
        else if (r < 0.83) h.write(tx.A[lookup('z', 'k')].update({ y: n() }));
        else if (r < 0.85)
          h.write(tx[pick(['A', 'B'])][pick([...as, ...bs])].delete());
        else {
          const pending = h.pendingEventIds().length;
          if (pending) {
            h.reject(Math.floor(rand() * pending), pick(['error', 'timeout']));
          }
        }
        await h.flush();
        if (scoped) {
          for (const name of Object.keys(QUERIES)) {
            expect(
              h.lastDelivered(hash[name]),
              `step ${step}, ${name}`,
            ).toEqual(h.truth(hash[name]));
          }
        }
        snapshots.push(
          Object.keys(QUERIES).map(
            (name) => h.deliveries.get(hash[name]).length,
          ),
        );
        recomputes += h.notifyOne.mock.calls.length;
      }
      return { h, hash, snapshots, recomputes };
    };

    const s = await run(true);
    const u = await run(false);
    for (const name of Object.keys(QUERIES)) {
      expect(s.h.deliveries.get(s.hash[name]), name).toEqual(
        u.h.deliveries.get(u.hash[name]),
      );
    }
    expect(s.snapshots).toEqual(u.snapshots);
    expect(s.recomputes).toBeLessThan(u.recomputes);
  }, 60_000);
});

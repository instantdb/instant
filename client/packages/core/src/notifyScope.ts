// Scopes the notify after a local write to the live queries the write can
// affect, so a write to one entity type doesn't re-run every query.
//
// A write's footprint and a query's footprint are both sets of keys. Keys use
// names rather than attribute ids, so they survive `_rewriteMutations`
// remapping ids and swapping a link's direction:
//
//   m|<etype>          membership: the etype's primary-key triples
//   a|<etype>|<label>  a blob attribute
//   r|<etype>|<label>  a ref (link) attribute. A write records both its
//                      forward and its reverse name; a query records the
//                      name it read.
//
// `null` means "can't classify cheaply and with certainty", and the caller
// notifies every query. Over-notifying is safe, because notifyOne's
// deep-compare still decides whether a callback fires. Under-notifying would
// leave a query showing stale data, so every doubt resolves to `null`.

import {
  type AttrsStore,
  getAttrByFwdIdentName,
  getAttrByReverseIdentName,
  getPrimaryKeyAttr,
} from './store.ts';

/** Stands for "any entity" in a write key's entity set. */
export const ANY_EID = true;

export type WriteKeyInfo = {
  etype: string;
  isRef: boolean;
  eids: Set<string> | typeof ANY_EID;
};

export type WriteFootprint = Map<string, WriteKeyInfo>;

export type QueryFootprint = {
  keys: Set<string>;
  /** Etypes read with no `fields`, so every blob attribute. */
  wild: Set<string>;
  /** Top-level etypes that can only read these entity ids. */
  pins: Map<string, Set<string>>;
};

function recordWrite(
  fp: WriteFootprint,
  key: string,
  etype: string,
  isRef: boolean,
  eid: unknown,
) {
  const entry = fp.get(key);
  const any = isRef || typeof eid !== 'string';
  if (!entry) {
    fp.set(key, {
      etype,
      isRef,
      eids: any ? ANY_EID : new Set([eid as string]),
    });
    return;
  }
  if (entry.eids === ANY_EID) return;
  if (any) {
    entry.eids = ANY_EID;
  } else {
    entry.eids.add(eid as string);
  }
}

/**
 * Adds the footprint of one mutation's tx-steps to `fp`. Returns `fp`, or
 * `null` when any step can't be classified.
 */
export function mutationFootprint(
  txSteps: unknown,
  attrs: AttrsStore | undefined,
  fp: WriteFootprint = new Map(),
): WriteFootprint | null {
  if (!attrs || !Array.isArray(txSteps)) return null;
  for (const step of txSteps) {
    if (!Array.isArray(step)) return null;
    const action = step[0];
    // A no-op on the store.
    if (action === 'rule-params') continue;
    if (
      action !== 'add-triple' &&
      action !== 'deep-merge-triple' &&
      action !== 'retract-triple'
    ) {
      // delete-entity (it cascades to other types), the attr actions
      // (add, update, delete, restore) and anything unrecognised.
      return null;
    }
    const [, eid, attrId, value, opts] = step;
    // An attr we don't hold (unsynced, or about to be rewritten) is unknown.
    const attr = attrs.getAttr(attrId);
    const fwd = attr?.['forward-identity'];
    if (!attr || !fwd) return null;
    const [, etype, label] = fwd;

    if (attr['value-type'] === 'ref') {
      const rev = attr['reverse-identity'];
      if (!rev) return null;
      recordWrite(fp, `r|${etype}|${label}`, etype, true, eid);
      recordWrite(fp, `r|${rev[1]}|${rev[2]}`, rev[1], true, eid);
      continue;
    }
    if (attr['value-type'] !== 'blob') return null;

    const isPrimaryKey = getPrimaryKeyAttr(attrs, etype)?.id === attr.id;
    // `update()` emits this for every entity it touches. store.transact
    // drops it when the entity is absent from a query's store, and otherwise
    // re-adds an identical triple, so it never changes what a query reads.
    if (
      isPrimaryKey &&
      action === 'add-triple' &&
      opts?.mode === 'update' &&
      value === eid &&
      typeof eid === 'string'
    ) {
      continue;
    }
    if (isPrimaryKey || label === 'id') {
      recordWrite(fp, `m|${etype}`, etype, false, eid);
    }
    recordWrite(fp, `a|${etype}|${label}`, etype, false, eid);
  }
  return fp;
}

// The `where` operators instaql understands. Anything else is unknown.
const WHERE_OPS = new Set([
  '$in',
  'in',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$like',
  '$ilike',
  '$isNull',
  '$not',
  '$ne',
]);

function isPlainObject(v: unknown): v is Record<string, any> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isKnownWhereValue(v: unknown) {
  if (!isPlainObject(v)) return true;
  return Object.keys(v).every((k) => WHERE_OPS.has(k));
}

function countEtype(seen: Map<string, number>, etype: string) {
  seen.set(etype, (seen.get(etype) || 0) + 1);
}

/** A ref label read from `etype`, forward or reverse, and the etype it leads to. */
function refHop(attrs: AttrsStore, etype: string, label: string) {
  const fwdAttr = getAttrByFwdIdentName(attrs, etype, label);
  const attr = fwdAttr || getAttrByReverseIdentName(attrs, etype, label);
  if (!attr || attr['value-type'] !== 'ref') return null;
  const next = fwdAttr
    ? attr['reverse-identity']?.[1]
    : attr['forward-identity']?.[1];
  return next || null;
}

function readWhere(
  fp: QueryFootprint,
  attrs: AttrsStore,
  etype: string,
  where: unknown,
  seen: Map<string, number>,
): boolean {
  if (!isPlainObject(where)) return false;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'or' || k === 'and') {
      if (!Array.isArray(v)) return false;
      for (const clause of v) {
        if (!readWhere(fp, attrs, etype, clause, seen)) return false;
      }
      continue;
    }
    // instaql ignores it.
    if (k === '$entityIdStartsWith') continue;
    if (!isKnownWhereValue(v)) return false;

    const path = k.split('.');
    let cur = etype;
    for (let i = 0; i < path.length - 1; i++) {
      const next = refHop(attrs, cur, path[i]);
      if (!next) return false;
      fp.keys.add(`r|${cur}|${path[i]}`);
      fp.keys.add(`m|${next}`);
      countEtype(seen, next);
      cur = next;
    }

    const last = path[path.length - 1];
    const fwdAttr = getAttrByFwdIdentName(attrs, cur, last);
    const attr = fwdAttr || getAttrByReverseIdentName(attrs, cur, last);
    if (!attr) return false;
    if (attr['value-type'] === 'ref') {
      fp.keys.add(`r|${cur}|${last}`);
      const other = fwdAttr
        ? attr['reverse-identity']?.[1]
        : attr['forward-identity']?.[1];
      if (!other) return false;
      fp.keys.add(`m|${other}`);
      countEtype(seen, other);
    } else {
      fp.keys.add(`a|${cur}|${last}`);
    }
    // `$isNull`, and the null patterns `$not` and `$ne` add, read the id attr.
    fp.keys.add(`m|${cur}`);
    fp.keys.add(`a|${cur}|id`);
  }
  return true;
}

function readLevel(
  fp: QueryFootprint,
  attrs: AttrsStore,
  etype: string,
  form: unknown,
  seen: Map<string, number>,
): boolean {
  if (!isPlainObject(form)) return false;
  countEtype(seen, etype);
  fp.keys.add(`m|${etype}`);

  const opts = form.$;
  if (opts !== undefined) {
    if (!isPlainObject(opts)) return false;
    // order, limit, first, last, offset, before, after, aggregate, ... all
    // depend on more than the entities they return.
    for (const k of Object.keys(opts)) {
      if (k !== 'where' && k !== 'fields') return false;
    }
  }

  const fields = opts?.fields;
  if (fields === undefined) {
    fp.wild.add(etype);
  } else {
    if (!Array.isArray(fields)) return false;
    for (const f of fields) {
      if (typeof f !== 'string') return false;
      fp.keys.add(`a|${etype}|${f}`);
    }
    // instaql always returns the id.
    fp.keys.add(`a|${etype}|id`);
  }

  if (
    opts?.where !== undefined &&
    !readWhere(fp, attrs, etype, opts.where, seen)
  ) {
    return false;
  }

  for (const label of Object.keys(form)) {
    if (label === '$') continue;
    const next = refHop(attrs, etype, label);
    if (!next) return false;
    fp.keys.add(`r|${etype}|${label}`);
    if (!readLevel(fp, attrs, next, form[label], seen)) return false;
  }
  return true;
}

/** `where: {id: "x"}` or `where: {id: {$in: ["x", ...]}}`: the ids, or null. */
function pinnedIds(where: any): Set<string> | null {
  const id = where?.id;
  if (typeof id === 'string') return new Set([id]);
  if (
    isPlainObject(id) &&
    Object.keys(id).length === 1 &&
    Array.isArray(id.$in) &&
    id.$in.every((x: unknown) => typeof x === 'string')
  ) {
    return new Set(id.$in);
  }
  return null;
}

/**
 * The keys a query reads, or `null` when it can't be classified.
 *
 * A top-level etype is pinned to the ids its `where` names by `id`, provided
 * the query reads that etype nowhere else. Without pins, a query for one
 * entity would re-run on every write to any entity of its type.
 */
export function queryFootprint(
  q: unknown,
  attrs: AttrsStore | undefined,
): QueryFootprint | null {
  if (!attrs || !isPlainObject(q)) return null;
  const fp: QueryFootprint = {
    keys: new Set(),
    wild: new Set(),
    pins: new Map(),
  };
  const seen = new Map<string, number>();
  for (const [etype, form] of Object.entries(q)) {
    // `$$ruleParams` changes what permissions let the query see.
    if (etype.startsWith('$$')) return null;
    if (!readLevel(fp, attrs, etype, form, seen)) return null;
  }
  for (const [etype, form] of Object.entries(q)) {
    const ids = pinnedIds(form.$?.where);
    if (ids && seen.get(etype) === 1) fp.pins.set(etype, ids);
  }
  return fp;
}

function sharesAny(a: Set<string>, b: Set<string>) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) {
    if (big.has(x)) return true;
  }
  return false;
}

/** Whether a write footprint can change what a query footprint reads. */
export function footprintsIntersect(
  writeFp: WriteFootprint,
  queryFp: QueryFootprint,
): boolean {
  for (const [key, { etype, isRef, eids }] of writeFp) {
    const hit =
      queryFp.keys.has(key) ||
      (key.startsWith('a|') && queryFp.wild.has(etype));
    if (!hit) continue;
    // A ref step's eid can be either side of the link, so pins never apply.
    if (isRef || eids === ANY_EID) return true;
    const pins = queryFp.pins.get(etype);
    if (!pins || sharesAny(eids, pins)) return true;
  }
  return false;
}

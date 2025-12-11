import { create } from 'mutative';
import { immutableDeepMerge } from './utils/object.js';
import { coerceToDate } from './utils/dates.ts';
import { InstantDBAttr } from './attrTypes.ts';
import { LinkIndex } from './utils/linkIndex.ts';

type Triple = [string, string, any, number];
type Attrs = Record<string, InstantDBAttr>;

type AttrIndexes = {
  blobAttrs: Map<string, Map<string, InstantDBAttr>>;
  primaryKeys: Map<string, InstantDBAttr>;
  forwardIdents: Map<string, Map<string, InstantDBAttr>>;
  revIdents: Map<string, Map<string, InstantDBAttr>>;
};

export type Store = {
  eav: Map<string, Map<string, Map<any, Triple>>>;
  aev: Map<string, Map<string, Map<any, Triple>>>;
  vae: Map<any, Map<string, Map<string, Triple>>>;
  useDateObjects: boolean | null;
  attrs: Attrs;
  attrIndexes: AttrIndexes;
  cardinalityInference: boolean | null;
  linkIndex: LinkIndex | null;
  __type: 'store';
};

export type StoreJson = {
  __type: 'store';
  attrs: Attrs;
  triples: Triple[];
  cardinalityInference: boolean | null;
  linkIndex: LinkIndex | null;
  useDateObjects: boolean | null;
};

function hasEA(attr: InstantDBAttr) {
  return attr['cardinality'] === 'one';
}

function isRef(attr: InstantDBAttr) {
  return attr['value-type'] === 'ref';
}

export function isBlob(attr: InstantDBAttr) {
  return attr['value-type'] === 'blob';
}

function getAttr(attrs: Attrs, attrId: string): InstantDBAttr | undefined {
  return attrs[attrId];
}

export function getInMap(obj, path) {
  return path.reduce((acc, key) => acc && acc.get(key), obj);
}

function deleteInMap(m, path) {
  if (path.length === 0) throw new Error('path must have at least one element');
  if (path.length === 1) {
    m.delete(path[0]);
    return;
  }
  const [head, ...tail] = path;
  if (!m.has(head)) return;
  deleteInMap(m.get(head), tail);
}

function setInMap(m, path, value) {
  if (path.length === 0) throw new Error('path must have at least one element');
  if (path.length === 1) {
    m.set(path[0], value);
    return;
  }
  const [head, ...tail] = path;
  let nextM = m.get(head);
  if (!nextM) {
    nextM = new Map();
    m.set(head, nextM);
  }
  setInMap(nextM, tail, value);
}

function isDateAttr(attr: InstantDBAttr) {
  return attr['checked-data-type'] === 'date';
}

function createTripleIndexes(
  attrs: Record<string, InstantDBAttr>,
  triples: Triple[],
  useDateObjects: boolean | null,
): Pick<Store, 'eav' | 'aev' | 'vae'> {
  const eav = new Map();
  const aev = new Map();
  const vae = new Map();
  for (const triple of triples) {
    let [eid, aid, v, t] = triple;
    const attr = getAttr(attrs, aid);
    if (!attr) {
      console.warn('no such attr', eid, attrs);
      continue;
    }

    if (attr['checked-data-type'] === 'date' && useDateObjects) {
      v = coerceToDate(v);
      triple[2] = v;
    }

    if (isRef(attr)) {
      setInMap(vae, [v, aid, eid], triple);
    }

    setInMap(eav, [eid, aid, v], triple);
    setInMap(aev, [aid, eid, v], triple);
  }
  return { eav, aev, vae };
}

function createAttrIndexes(attrs: Record<string, InstantDBAttr>): AttrIndexes {
  const blobAttrs = new Map();
  const primaryKeys = new Map();
  const forwardIdents = new Map();
  const revIdents = new Map();
  for (const attr of Object.values(attrs)) {
    const fwdIdent = attr['forward-identity'];
    const [_, fwdEtype, fwdLabel] = fwdIdent;
    const revIdent = attr['reverse-identity'];

    setInMap(forwardIdents, [fwdEtype, fwdLabel], attr);
    if (isBlob(attr)) {
      setInMap(blobAttrs, [fwdEtype, fwdLabel], attr);
    }
    if (attr['primary?']) {
      setInMap(primaryKeys, [fwdEtype], attr);
    }
    if (revIdent) {
      const [_, revEtype, revLabel] = revIdent;
      setInMap(revIdents, [revEtype, revLabel], attr);
    }
  }

  return { blobAttrs, primaryKeys, forwardIdents, revIdents };
}

export function toJSON(store: Store): StoreJson {
  return {
    __type: store.__type,
    attrs: store.attrs,
    triples: allMapValues(store.eav, 3),
    cardinalityInference: store.cardinalityInference,
    linkIndex: store.linkIndex,
    useDateObjects: store.useDateObjects,
  };
}

export function fromJSON(storeJSON: StoreJson): Store {
  return createStore(
    storeJSON.attrs,
    storeJSON.triples,
    storeJSON.cardinalityInference,
    storeJSON.linkIndex,
    storeJSON.useDateObjects,
  );
}

export function hasTriple(store: Store, [e, a, v]: [string, string, any]) {
  return getInMap(store.eav, [e, a, v]) !== undefined;
}

export function hasEntity(store: Store, e: string) {
  return getInMap(store.eav, [e]) !== undefined;
}

function resetAttrIndexes(store: Store) {
  store.attrIndexes = createAttrIndexes(store.attrs);
}

export function createStore(
  attrs: Record<string, InstantDBAttr>,
  triples: Triple[],
  enableCardinalityInference: boolean | null,
  linkIndex: LinkIndex | null,
  useDateObjects: boolean | null,
): Store {
  const store = createTripleIndexes(
    attrs,
    triples,
    useDateObjects,
  ) as unknown as Store;
  store.useDateObjects = useDateObjects;
  store.attrs = attrs;
  store.attrIndexes = createAttrIndexes(attrs);
  store.cardinalityInference = enableCardinalityInference;
  store.linkIndex = linkIndex;
  store.__type = 'store';

  return store;
}

// We may have local triples with lookup refs in them,
// we need to convert those lookup refs to eids to insert them
// into the store. If we can't find the lookup ref locally,
// then we drop the triple and have to wait for the server response
// to see the optimistic updates.
function resolveLookupRefs(store: Store, triple: Triple): Triple | null {
  let eid;

  // Check if `e` is a lookup ref
  if (Array.isArray(triple[0])) {
    const [a, v] = triple[0];
    const eMaps = store.aev.get(a);
    if (!eMaps) {
      // We don't have the attr, so don't try to add the
      // triple to the store
      return null;
    }
    // This would be a lot more efficient with a ave index
    const triples = allMapValues(eMaps, 2);
    eid = triples.find((x) => x[2] === v)?.[0];
  } else {
    eid = triple[0];
  }

  if (!eid) {
    // We don't know the eid that the ref refers to, so
    // we can't add the triple to the store.
    return null;
  }

  // Check if v is a lookup ref
  const lookupV = triple[2];
  if (
    Array.isArray(lookupV) &&
    lookupV.length === 2 &&
    store.aev.get(lookupV[0])
  ) {
    const [a, v] = lookupV;
    const eMaps = store.aev.get(a);
    if (!eMaps) {
      // We don't have the attr, so don't try to add the
      // triple to the store
      return null;
    }
    const triples = allMapValues(eMaps, 2);
    const value = triples.find((x) => x[2] === v)?.[0];
    if (!value) {
      return null;
    }
    const [_e, aid, _v, ...rest] = triple;
    return [eid, aid, value, ...rest];
  } else {
    const [_, ...rest] = triple;
    return [eid, ...rest];
  }
}

export function retractTriple(store: Store, rawTriple: Triple): void {
  const triple = resolveLookupRefs(store, rawTriple);
  if (!triple) {
    return;
  }
  const [eid, aid, v] = triple;
  const attr = getAttr(store.attrs, aid);
  if (!attr) {
    return;
  }

  deleteInMap(store.eav, [eid, aid, v]);
  deleteInMap(store.aev, [aid, eid, v]);
  if (isRef(attr)) {
    deleteInMap(store.vae, [v, aid, eid]);
  }
}

let _seed = 0;
function getCreatedAt(
  store: Store,
  attr: InstantDBAttr,
  triple: Triple,
): Number {
  const [eid, aid, v] = triple;
  let createdAt;

  const t = getInMap(store.eav, [eid, aid, v]);
  if (t) {
    createdAt = t[3];
  }

  /**
   * (XXX)
   * Two hacks here, for generating a `createdAt`
   *
   * 1. We multiply Date.now() by 10, to make sure that
   *  `createdAt` is always greater than anything the server
   *   could return
   *
   *   We do this because right now we know we _only_ insert
   *   triples as optimistic updates.
   *
   * 2. We increment by `_seed`, to make sure there are no
   *    two triples with the same `createdAt`. This is
   *    done to make tests more predictable.
   *
   * We may need to rethink this. Because we * 10, we can't
   * use this value as an _actual_ `createdAt` timestamp.
   * Eventually we may want too though; For example, we could
   * use `createdAt` for each triple, to infer a `createdAt` and
   * `updatedAt` value for each object.
   */
  return createdAt || Date.now() * 10 + _seed++;
}

export function addTriple(store: Store, rawTriple: Triple) {
  const triple = resolveLookupRefs(store, rawTriple);
  if (!triple) {
    return;
  }
  let [eid, aid, v] = triple;
  const attr = getAttr(store.attrs, aid);
  if (!attr) {
    // (XXX): Due to the way we're handling attrs, it's
    // possible to enter a state where we receive a triple without an attr.
    // See: https://github.com/jsventures/instant-local/pull/132 for details.
    // For now, if we receive a command without an attr, we no-op.
    return;
  }

  if (attr['checked-data-type'] === 'date' && store.useDateObjects) {
    v = coerceToDate(v);
  }

  const existingTriple = getInMap(store.eav, [eid, aid, v]);
  // Reuse the created_at for a triple if it's already in the store.
  // Prevents updates from temporarily pushing an entity to the top
  // while waiting for the server response.
  const t = existingTriple?.[3] ?? getCreatedAt(store, attr, triple);
  const enhancedTriple = [eid, aid, v, t];

  if (hasEA(attr)) {
    setInMap(store.eav, [eid, aid], new Map([[v, enhancedTriple]]));
    setInMap(store.aev, [aid, eid], new Map([[v, enhancedTriple]]));
  } else {
    setInMap(store.eav, [eid, aid, v], enhancedTriple);
    setInMap(store.aev, [aid, eid, v], enhancedTriple);
  }

  if (isRef(attr)) {
    setInMap(store.vae, [v, aid, eid], enhancedTriple);
  }
}

function mergeTriple(store: Store, rawTriple: Triple) {
  const triple = resolveLookupRefs(store, rawTriple);
  if (!triple) {
    return;
  }

  const [eid, aid, update] = triple;
  const attr = getAttr(store.attrs, aid);

  if (!attr) return;

  if (!isBlob(attr))
    throw new Error('merge operation is not supported for links');

  const eavValuesMap = getInMap(store.eav, [eid, aid]);
  if (!eavValuesMap) return;

  const currentTriple = eavValuesMap.values().next()?.value;
  if (!currentTriple) return;

  const currentValue = currentTriple[2];

  const updatedValue = immutableDeepMerge(currentValue, update);
  const enhancedTriple = [
    eid,
    aid,
    updatedValue,
    getCreatedAt(store, attr, currentTriple),
  ];

  setInMap(store.eav, [eid, aid], new Map([[updatedValue, enhancedTriple]]));
}

function deleteEntity(store: Store, args: any[]) {
  const [lookup, etype] = args;
  const triple = resolveLookupRefs(store, [lookup] as unknown as Triple);

  if (!triple) {
    return;
  }
  const [id] = triple;

  // delete forward links and attributes + cardinality one links
  const eMap = store.eav.get(id);
  if (eMap) {
    for (const a of eMap.keys()) {
      const attr = store.attrs[a];

      // delete cascade refs
      if (attr && attr['on-delete-reverse'] === 'cascade') {
        allMapValues(eMap.get(a), 1).forEach(
          ([e, a, v]: [string, string, any]) =>
            deleteEntity(store, [v, attr['reverse-identity']?.[1]]),
        );
      }

      if (
        // Fall back to deleting everything if we've rehydrated tx-steps from
        // the store that didn't set `etype` in deleteEntity
        !etype ||
        // If we don't know about the attr, let's just get rid of it
        !attr ||
        // Make sure it matches the etype
        attr['forward-identity']?.[1] === etype
      ) {
        deleteInMap(store.aev, [a, id]);
        deleteInMap(store.eav, [id, a]);
      }
    }
    // Clear out the eav index for `id` if we deleted all of the attributes
    if (eMap.size === 0) {
      deleteInMap(store.eav, [id]);
    }
  }

  // delete reverse links
  const vaeTriples = store.vae.get(id) && allMapValues(store.vae.get(id), 2);

  if (vaeTriples) {
    vaeTriples.forEach((triple: Triple) => {
      const [e, a, v] = triple;
      const attr = store.attrs[a];
      if (!etype || !attr || attr['reverse-identity']?.[1] === etype) {
        deleteInMap(store.eav, [e, a, v]);
        deleteInMap(store.aev, [a, e, v]);
        deleteInMap(store.vae, [v, a, e]);
      }
      if (
        attr &&
        attr['on-delete'] === 'cascade' &&
        attr['reverse-identity']?.[1] === etype
      ) {
        deleteEntity(store, [e, attr['forward-identity']?.[1]]);
      }
    });
  }
  // Clear out vae index for `id` if we deleted all the reverse attributes
  if (store.vae.get(id)?.size === 0) {
    deleteInMap(store.vae, [id]);
  }
}

// (XXX): Whenever we change/delete attrs,
// We indiscriminately reset the index map.
// There are lots of opportunities for optimization:
// * We _only_ need to run this indexes change. We could detect that
// * We could batch this reset at the end
// * We could add an ave index for all triples, so removing the
//   right triples is easy and fast.
function resetIndexMap(store: Store, newTriples: Triple[]) {
  const newIndexMap = createTripleIndexes(
    store.attrs,
    newTriples,
    store.useDateObjects,
  );
  Object.keys(newIndexMap).forEach((key) => {
    store[key] = newIndexMap[key];
  });
}

function addAttr(store: Store, [attr]: [InstantDBAttr]) {
  store.attrs[attr.id] = attr;
  resetAttrIndexes(store);
}

function getAllTriples(store: Store): Triple[] {
  return allMapValues(store.eav, 3);
}

function deleteAttr(store: Store, [id]: [string]) {
  if (!store.attrs[id]) return;
  const newTriples = getAllTriples(store).filter(([_, aid]) => aid !== id);
  delete store.attrs[id];
  resetAttrIndexes(store);
  resetIndexMap(store, newTriples);
}

function updateAttr(
  store: Store,
  [partialAttr]: [Partial<InstantDBAttr> & { id: string }],
) {
  const attr = store.attrs[partialAttr.id];
  if (!attr) return;
  store.attrs[partialAttr.id] = { ...attr, ...partialAttr };
  resetAttrIndexes(store);
  resetIndexMap(store, getAllTriples(store));
}

function applyTxStep(store: Store, txStep) {
  const [action, ...args] = txStep;
  switch (action) {
    case 'add-triple':
      addTriple(store, args);
      break;
    case 'deep-merge-triple':
      mergeTriple(store, args);
      break;
    case 'retract-triple':
      retractTriple(store, args);
      break;
    case 'delete-entity':
      deleteEntity(store, args);
      break;
    case 'add-attr':
      addAttr(store, args);
      break;
    case 'delete-attr':
      deleteAttr(store, args);
      break;
    case 'update-attr':
      updateAttr(store, args);
      break;
    case 'restore-attr':
      break;
    case 'rule-params':
      break;
    default:
      throw new Error(`unhandled transaction action: ${action}`);
  }
}

export function allMapValues(m, level, res: any[] = []) {
  if (!m) {
    return res;
  }
  if (level === 0) {
    return res;
  }
  if (level === 1) {
    for (const v of m.values()) {
      res.push(v);
    }
    return res;
  }
  for (const v of m.values()) {
    allMapValues(v, level - 1, res);
  }

  return res;
}

function triplesByValue(store: Store, m: Map<any, Triple>, v: any) {
  const res: Triple[] = [];
  if (v?.hasOwnProperty('$not')) {
    for (const candidate of m.keys()) {
      if (v.$not !== candidate) {
        res.push(m.get(candidate) as Triple);
      }
    }
    return res;
  }

  if (v?.hasOwnProperty('$isNull')) {
    const { attrId, isNull, reverse } = v.$isNull;

    if (reverse) {
      for (const candidate of m.keys()) {
        const vMap = store.vae.get(candidate);
        const isValNull = !vMap || !vMap.get(attrId);
        if (isNull ? isValNull : !isValNull) {
          res.push(m.get(candidate) as Triple);
        }
      }
    } else {
      const aMap = store.aev.get(attrId);
      for (const candidate of m.keys()) {
        const isValNull =
          !aMap || aMap.get(candidate)?.get(null) || !aMap.get(candidate);
        if (isNull ? isValNull : !isValNull) {
          res.push(m.get(candidate) as Triple);
        }
      }
    }
    return res;
  }

  if (v?.$comparator) {
    // TODO: A sorted index would be nice here
    return allMapValues(m, 1).filter(v.$op);
  }

  const values = v.in || v.$in || [v];

  for (const value of values) {
    const triple = m.get(value);
    if (triple) {
      res.push(triple);
    }
  }

  return res;
}

// A poor man's pattern matching
// Returns either eav, ea, ev, av, v, or ''
function whichIdx(e, a, v): 'eav' | 'ea' | 'ev' | 'av' | 'e' | 'a' | 'v' | '' {
  let res = '';
  if (e !== undefined) {
    res += 'e';
  }
  if (a !== undefined) {
    res += 'a';
  }
  if (v !== undefined) {
    res += 'v';
  }
  return res as 'eav' | 'ea' | 'ev' | 'av' | 'e' | 'a' | 'v' | '';
}

export function getTriples(store, [e, a, v]) {
  const idx = whichIdx(e, a, v);
  switch (idx) {
    case 'e': {
      const eMap = store.eav.get(e);
      return allMapValues(eMap, 2);
    }
    case 'ea': {
      const aMap = store.eav.get(e)?.get(a);
      return allMapValues(aMap, 1);
    }
    case 'eav': {
      const aMap = store.eav.get(e)?.get(a);
      if (!aMap) {
        return [];
      }
      return triplesByValue(store, aMap, v);
    }
    case 'ev': {
      const eMap = store.eav.get(e);
      if (!eMap) {
        return [];
      }
      const res: Triple[] = [];
      for (const aMap of eMap.values()) {
        res.push(...triplesByValue(store, aMap, v));
      }
      return res;
    }
    case 'a': {
      const aMap = store.aev.get(a);
      return allMapValues(aMap, 2);
    }
    case 'av': {
      const aMap = store.aev.get(a);
      if (!aMap) {
        return [];
      }
      const res: Triple[] = [];
      for (const eMap of aMap.values()) {
        res.push(...triplesByValue(store, eMap, v));
      }
      return res;
    }
    case 'v': {
      const res: Triple[] = [];
      for (const eMap of store.eav.values()) {
        for (const aMap of eMap.values()) {
          res.push(...triplesByValue(store, aMap, v));
        }
      }
      return res;
    }
    default: {
      return allMapValues(store.eav, 3);
    }
  }
}

export function getAsObject(
  store: Store,
  attrs: Map<string, InstantDBAttr> | undefined,
  e: string,
) {
  const obj = {};

  if (!attrs) {
    return obj;
  }

  for (const [label, attr] of attrs.entries()) {
    const aMap = store.eav.get(e)?.get(attr.id);
    const triples = allMapValues(aMap, 1);
    for (const triple of triples) {
      obj[label] = triple[2];
    }
  }

  return obj;
}

export function getAttrByFwdIdentName(
  store: Store,
  inputEtype: string,
  inputLabel: string,
) {
  return store.attrIndexes.forwardIdents.get(inputEtype)?.get(inputLabel);
}

export function getAttrByReverseIdentName(
  store: Store,
  inputEtype: string,
  inputLabel: string,
) {
  return store.attrIndexes.revIdents.get(inputEtype)?.get(inputLabel);
}

export function getBlobAttrs(store: Store, etype: string) {
  return store.attrIndexes.blobAttrs.get(etype);
}

export function getPrimaryKeyAttr(store: Store, etype: string) {
  const fromPrimary = store.attrIndexes.primaryKeys.get(etype);
  if (fromPrimary) {
    return fromPrimary;
  }
  return store.attrIndexes.forwardIdents.get(etype)?.get('id');
}

function findTriple(
  store: Store,
  rawTriple: [string, string, any] | Triple,
): Triple | undefined {
  const triple = resolveLookupRefs(store, rawTriple as Triple);
  if (!triple) {
    return;
  }

  const [eid, aid, v] = triple;
  const attr = getAttr(store.attrs, aid);
  if (!attr) {
    // (XXX): Due to the way we're handling attrs, it's
    // possible to enter a state where we receive a triple without an attr.
    // See: https://github.com/jsventures/instant-local/pull/132 for details.
    // For now, if we receive a command without an attr, we no-op.
    return;
  }

  return getInMap(store.eav, [eid, aid]);
}

export function transact(store: Store, txSteps) {
  const txStepsFiltered = txSteps.filter(
    ([action, eid, attrId, value, opts]) => {
      if (action !== 'add-triple' && action !== 'deep-merge-triple') {
        return true;
      }

      const mode = opts?.mode;
      if (mode !== 'create' && mode !== 'update') {
        return true;
      }

      let exists = false;

      const attr = getAttr(store.attrs, attrId);
      if (attr) {
        const idAttr = getPrimaryKeyAttr(store, attr['forward-identity'][1]);
        exists = !!findTriple(store, [
          eid as string,
          idAttr?.id as string,
          eid,
        ]);
      }

      if (mode === 'create' && exists) {
        return false;
      }

      if (mode === 'update' && !exists) {
        return false;
      }

      return true;
    },
  );

  return create(store, (draft) => {
    txStepsFiltered.forEach((txStep) => {
      applyTxStep(draft, txStep);
    });
  });
}

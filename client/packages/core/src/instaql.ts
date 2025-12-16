import { query as datalogQuery } from './datalog.js';
import { uuidCompare } from './utils/id.ts';
import { stringCompare } from './utils/strings.ts';
import * as s from './store.ts';
import { InstantDBAttr } from './attrTypes.ts';
import { Cursor } from './queryTypes.ts';

type Pat = [string | any, string, string | any, string | number];
type Pats = Array<Pat>;
type OrPat = {
  or: {
    patterns: FullPats;
    joinSym: string;
  };
};
type AndPat = {
  and: {
    patterns: FullPats;
    joinSym: string;
  };
};
type FullPat = Pat | OrPat | AndPat;
type FullPats = Array<FullPat>;

// Pattern variables
// -----------------

type MakeVar = (x: string, level: number) => string;

let _seed = 0;

function wildcard(friendlyName: string) {
  return makeVarImpl(`_${friendlyName}`, _seed++);
}

function makeVarImpl(x: string, level: number): string {
  return `?${x}-${level}`;
}

// Where
// -----------------

class AttrNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AttrNotFoundError';
  }
}

function idAttr(attrsStore: s.AttrsStore, ns: string): InstantDBAttr {
  const attr = s.getPrimaryKeyAttr(attrsStore, ns);

  if (!attr) {
    throw new AttrNotFoundError(`Could not find id attr for ${ns}`);
  }
  return attr;
}

function defaultWhere(
  makeVar: MakeVar,
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
): Pats {
  return [eidWhere(makeVar, attrsStore, etype, level)];
}

function eidWhere(
  makeVar: MakeVar,
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
): Pat {
  return [
    makeVar(etype, level),
    idAttr(attrsStore, etype).id,
    makeVar(etype, level),
    makeVar('time', level),
  ];
}

function replaceInAttrPat(attrPat: Pat, needle: string, v: any): Pat {
  return attrPat.map((x) => (x === needle ? v : x)) as Pat;
}

function refAttrPat(
  makeVar: MakeVar,
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
  label: string,
): [string, number, Pat, InstantDBAttr, boolean] {
  const fwdAttr = s.getAttrByFwdIdentName(attrsStore, etype, label);
  const revAttr = s.getAttrByReverseIdentName(attrsStore, etype, label);
  const attr = fwdAttr || revAttr;

  if (!attr) {
    throw new AttrNotFoundError(`Could not find attr for ${[etype, label]}`);
  }

  if (attr['value-type'] !== 'ref') {
    throw new Error(`Attr ${attr.id} is not a ref`);
  }

  const [_f, fwdEtype] = attr['forward-identity'];
  const [_r, revEtype] = attr['reverse-identity']!;
  const nextLevel = level + 1;
  const attrPat: Pat = fwdAttr
    ? [
        makeVar(fwdEtype, level),
        attr.id,
        makeVar(revEtype, nextLevel),
        wildcard('time'),
      ]
    : [
        makeVar(fwdEtype, nextLevel),
        attr.id,
        makeVar(revEtype, level),
        wildcard('time'),
      ];

  const nextEtype = fwdAttr ? revEtype : fwdEtype;

  const isForward = Boolean(fwdAttr);

  return [nextEtype, nextLevel, attrPat, attr, isForward];
}

function makeLikeMatcher(caseSensitive: boolean, pattern: string) {
  if (typeof pattern !== 'string') {
    return function likeMatcher(_value) {
      return false;
    };
  }

  const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = escapedPattern.replace(/%/g, '.*').replace(/_/g, '.');

  const regex = new RegExp(
    `^${regexPattern}$`,
    caseSensitive ? undefined : 'i',
  );

  return function likeMatcher(value) {
    if (typeof value !== 'string') {
      return false;
    }
    return regex.test(value);
  };
}

function parseValue(attr: InstantDBAttr, v: any) {
  if (
    typeof v !== 'object' ||
    v.hasOwnProperty('$in') ||
    v.hasOwnProperty('in')
  ) {
    return v;
  }

  const isDate = attr['checked-data-type'] === 'date';

  if (v.hasOwnProperty('$gt')) {
    return {
      $comparator: true,
      $op: isDate
        ? function gtDate(triple) {
            return new Date(triple[2]) > new Date(v.$gt);
          }
        : function gt(triple) {
            return triple[2] > v.$gt;
          },
    };
  }
  if (v.hasOwnProperty('$gte')) {
    return {
      $comparator: true,
      $op: isDate
        ? function gteDate(triple) {
            return new Date(triple[2]) >= new Date(v.$gte);
          }
        : function gte(triple) {
            return triple[2] >= v.$gte;
          },
    };
  }

  if (v.hasOwnProperty('$lt')) {
    return {
      $comparator: true,
      $op: isDate
        ? function ltDate(triple) {
            return new Date(triple[2]) < new Date(v.$lt);
          }
        : function lt(triple) {
            return triple[2] < v.$lt;
          },
    };
  }
  if (v.hasOwnProperty('$lte')) {
    return {
      $comparator: true,
      $op: isDate
        ? function lteDate(triple) {
            return new Date(triple[2]) <= new Date(v.$lte);
          }
        : function lte(triple) {
            return triple[2] <= v.$lte;
          },
    };
  }

  if (v.hasOwnProperty('$like')) {
    const matcher = makeLikeMatcher(true, v.$like);
    return {
      $comparator: true,
      $op: function like(triple) {
        return matcher(triple[2]);
      },
    };
  }

  if (v.hasOwnProperty('$ilike')) {
    const matcher = makeLikeMatcher(false, v.$ilike);
    return {
      $comparator: true,
      $op: function ilike(triple) {
        return matcher(triple[2]);
      },
    };
  }

  return v;
}

function valueAttrPat(
  makeVar: MakeVar,
  attrsStore: s.AttrsStore,
  valueEtype: string,
  valueLevel: number,
  valueLabel: string,
  v: any,
): Pat {
  const fwdAttr = s.getAttrByFwdIdentName(attrsStore, valueEtype, valueLabel);
  const revAttr = s.getAttrByReverseIdentName(
    attrsStore,
    valueEtype,
    valueLabel,
  );
  const attr = fwdAttr || revAttr;

  if (!attr) {
    throw new AttrNotFoundError(
      `No attr for etype = ${valueEtype} label = ${valueLabel}`,
    );
  }

  if (v?.hasOwnProperty('$isNull')) {
    const idAttr = s.getAttrByFwdIdentName(attrsStore, valueEtype, 'id');
    if (!idAttr) {
      throw new AttrNotFoundError(
        `No attr for etype = ${valueEtype} label = id`,
      );
    }

    return [
      makeVar(valueEtype, valueLevel),
      idAttr.id,
      { $isNull: { attrId: attr.id, isNull: v.$isNull, reverse: !fwdAttr } },
      wildcard('time'),
    ];
  }

  if (fwdAttr) {
    return [
      makeVar(valueEtype, valueLevel),
      attr.id,
      parseValue(attr, v),
      wildcard('time'),
    ];
  }
  return [v, attr.id, makeVar(valueEtype, valueLevel), wildcard('time')];
}

function refAttrPats(
  makeVar: MakeVar,
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
  refsPath: string[],
): [string, number, Pats] {
  const [lastEtype, lastLevel, attrPats] = refsPath.reduce(
    (acc, label) => {
      const [etype, level, attrPats] = acc;
      const [nextEtype, nextLevel, attrPat] = refAttrPat(
        makeVar,
        attrsStore,
        etype,
        level,
        label,
      );
      return [nextEtype, nextLevel, [...attrPats, attrPat]];
    },
    [etype, level, []],
  );

  return [lastEtype, lastLevel, attrPats];
}

function whereCondAttrPats(
  makeVar: MakeVar,
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
  path: string[],
  v: any,
): Pats {
  const refsPath = path.slice(0, path.length - 1);
  const valueLabel = path[path.length - 1];
  const [lastEtype, lastLevel, refPats] = refAttrPats(
    makeVar,
    attrsStore,
    etype,
    level,
    refsPath,
  );
  const valuePat = valueAttrPat(
    makeVar,
    attrsStore,
    lastEtype,
    lastLevel,
    valueLabel,
    v,
  );

  return refPats.concat([valuePat]);
}

function withJoin(where, join) {
  return join ? [join].concat(where) : where;
}

function isOrClauses([k, v]): boolean {
  return k === 'or' && Array.isArray(v);
}

function isAndClauses([k, v]): boolean {
  return k === 'and' && Array.isArray(v);
}

// Creates a makeVar that will namespace symbols for or clauses
// to prevent conflicts, except for the base etype
function genMakeVar(baseMakeVar: MakeVar, joinSym: string, orIdx: number) {
  return (x, lvl) => {
    const base = baseMakeVar(x, lvl);
    if (joinSym == base) {
      return base;
    }
    return `${base}-${orIdx}`;
  };
}

function parseWhereClauses(
  makeVar: MakeVar,
  clauseType: 'or' | 'and' /* 'or' | 'and' */,
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
  whereValue: any,
): FullPat {
  const joinSym = makeVar(etype, level);
  const patterns: FullPats = whereValue.map((w, i) => {
    const makeNamespacedVar = genMakeVar(makeVar, joinSym, i);
    return parseWhere(makeNamespacedVar, attrsStore, etype, level, w);
  });
  return { [clauseType]: { patterns, joinSym } } as AndPat | OrPat;
}

// Given a path, returns a list of paths leading up to this path:
// growPath([1, 2, 3]) -> [[1], [1, 2], [1, 2, 3]]
function growPath<T>(path: T[]) {
  const ret: Array<T[]> = [];
  for (let i = 1; i <= path.length; i++) {
    ret.push(path.slice(0, i));
  }
  return ret;
}

// Returns array of pattern arrays that should be grouped in OR
// to capture any intermediate nulls
function whereCondAttrPatsForNullIsTrue(
  makeVar: MakeVar,
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
  path: string[],
): Pats[] {
  return growPath(path).map((path) =>
    whereCondAttrPats(makeVar, attrsStore, etype, level, path, {
      $isNull: true,
    }),
  );
}

function parseWhere(
  makeVar: MakeVar,
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
  where: Record<string, any>,
): FullPats {
  return Object.entries(where).flatMap(([k, v]) => {
    if (isOrClauses([k, v])) {
      return parseWhereClauses(makeVar, 'or', attrsStore, etype, level, v);
    }
    if (isAndClauses([k, v])) {
      return parseWhereClauses(makeVar, 'and', attrsStore, etype, level, v);
    }

    // Temporary hack until we have support for a uuid index on `id`
    if (k === '$entityIdStartsWith') {
      return [];
    }

    const path = k.split('.');

    // Normalize $ne to $not
    if (v?.hasOwnProperty('$ne')) {
      v = { ...v, $not: v.$ne };
      delete v.$ne;
    }

    if (v?.hasOwnProperty('$not')) {
      // `$not` won't pick up entities that are missing the attr, so we
      // add in a `$isNull` to catch those too.
      const notPats = whereCondAttrPats(
        makeVar,
        attrsStore,
        etype,
        level,
        path,
        v,
      );
      const nilPats = whereCondAttrPatsForNullIsTrue(
        makeVar,
        attrsStore,
        etype,
        level,
        path,
      );
      return [
        {
          or: {
            patterns: [notPats, ...nilPats],
            joinSym: makeVar(etype, level),
          },
        },
      ];
    }

    if (v?.hasOwnProperty('$isNull') && v.$isNull === true && path.length > 1) {
      // Make sure we're capturing all of the intermediate paths that might be null
      // by checking for null at each step along the path
      return [
        {
          or: {
            patterns: whereCondAttrPatsForNullIsTrue(
              makeVar,
              attrsStore,
              etype,
              level,
              path,
            ),
            joinSym: makeVar(etype, level),
          },
        },
      ];
    }

    return whereCondAttrPats(makeVar, attrsStore, etype, level, path, v);
  });
}

function makeWhere(
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
  where: Record<string, any> | null,
): FullPats {
  const makeVar = makeVarImpl;
  if (!where) {
    return defaultWhere(makeVar, attrsStore, etype, level);
  }
  const parsedWhere = parseWhere(makeVar, attrsStore, etype, level, where);
  return parsedWhere.concat(defaultWhere(makeVar, attrsStore, etype, level));
}

// Find
// -----------------

function makeFind(makeVar: MakeVar, etype: string, level: number) {
  return [makeVar(etype, level), makeVar('time', level)];
}

// extendObjects
// -----------------

function makeJoin(
  makeVar: MakeVar,
  attrsStore: s.AttrsStore,
  etype: string,
  level: number,
  label: string,
  eid: string,
) {
  const [nextEtype, nextLevel, pat, attr, isForward] = refAttrPat(
    makeVar,
    attrsStore,
    etype,
    level,
    label,
  );
  const actualized = replaceInAttrPat(pat, makeVar(etype, level), eid);
  return [nextEtype, nextLevel, actualized, attr, isForward];
}

function extendObjects(
  makeVar: MakeVar,
  store: s.Store,
  attrsStore: s.AttrsStore,
  { etype, level, form },
  objects,
) {
  const childQueries = Object.keys(form).filter((c) => c !== '$');
  if (!childQueries.length) {
    return Object.values(objects);
  }
  return Object.entries(objects).map(function extendChildren([eid, parent]) {
    const childResults = childQueries.map(function getChildResult(label) {
      const isSingular = Boolean(
        store.cardinalityInference &&
          attrsStore.linkIndex?.[etype]?.[label]?.isSingular,
      );

      try {
        const [nextEtype, nextLevel, join] = makeJoin(
          makeVar,
          attrsStore,
          etype,
          level,
          label,
          eid,
        );

        const childrenArray = queryOne(store, attrsStore, {
          etype: nextEtype,
          level: nextLevel,
          form: form[label],
          join,
        });

        const childOrChildren = isSingular ? childrenArray[0] : childrenArray;

        return { [label]: childOrChildren };
      } catch (e) {
        if (e instanceof AttrNotFoundError) {
          return { [label]: isSingular ? undefined : [] };
        }
        throw e;
      }
    });

    return childResults.reduce(function reduceChildren(parent, child) {
      return { ...parent, ...child };
    }, parent);
  });
}

// resolveObjects
// -----------------

function shouldIgnoreAttr(attrs, id) {
  const attr = attrs[id];
  return attr['value-type'] === 'ref' && attr['forward-identity'][2] !== 'id';
}

// Compares values where we already know that the two values are distinct
// and not null.
// Takes into account the data type.
function compareDisparateValues(a, b, dataType) {
  if (dataType === 'string') {
    return stringCompare(a, b);
  }
  if (a > b) {
    return 1;
  }
  return -1;
}

export function compareOrder(id_a: string, v_a, id_b: string, v_b, dataType) {
  if (v_a === v_b || (v_a == null && v_b == null)) {
    return uuidCompare(id_a, id_b);
  }

  if (v_b == null) {
    return 1;
  }
  if (v_a == null) {
    return -1;
  }

  return compareDisparateValues(v_a, v_b, dataType);
}

function compareOrderTriples(
  [id_a, v_a]: [string, any],
  [id_b, v_b]: [string, any],
  dataType,
) {
  return compareOrder(id_a, v_a, id_b, v_b, dataType);
}

function comparableDate(x) {
  if (x == null) {
    return x;
  }
  return new Date(x).getTime();
}

function isBefore(startCursor, orderAttr, direction, idVec) {
  const [c_e, _c_a, c_v, c_t] = startCursor;
  const compareVal = direction === 'desc' ? 1 : -1;
  if (orderAttr['forward-identity']?.[2] === 'id') {
    return compareOrderTriples(idVec, [c_e, c_t], null) === compareVal;
  }
  const [e, v] = idVec;
  const dataType = orderAttr['checked-data-type'];
  const v_new = dataType === 'date' ? comparableDate(v) : v;
  const c_v_new = dataType === 'date' ? comparableDate(c_v) : c_v;

  return (
    compareOrderTriples([e, v_new], [c_e, c_v_new], dataType) === compareVal
  );
}

function orderAttrFromCursor(attrsStore: s.AttrsStore, cursor) {
  const cursorAttrId = cursor[1];
  return attrsStore.getAttr(cursorAttrId);
}

function orderAttrFromOrder(attrsStore: s.AttrsStore, etype, order) {
  const label = Object.keys(order)[0];
  return s.getAttrByFwdIdentName(attrsStore, etype, label);
}

function getOrderAttr(attrsStore: s.AttrsStore, etype, cursor, order) {
  if (cursor) {
    return orderAttrFromCursor(attrsStore, cursor);
  }
  if (order) {
    return orderAttrFromOrder(attrsStore, etype, order);
  }
}

function objectAttrs(
  attrsStore: s.AttrsStore,
  etype,
  dq,
): Map<string, InstantDBAttr> | undefined {
  if (!Array.isArray(dq.fields)) {
    return s.getBlobAttrs(attrsStore, etype);
  }

  const attrs = new Map();

  for (const field of dq.fields) {
    const attr = s.getAttrByFwdIdentName(attrsStore, etype, field);
    const label = attr?.['forward-identity']?.[2];
    if (label && s.isBlob(attr)) {
      attrs.set(label, attr);
    }
  }
  // Ensure we add the id field to avoid empty objects
  if (!attrs.has('id')) {
    const attr = s.getAttrByFwdIdentName(attrsStore, etype, 'id');
    const label = attr?.['forward-identity']?.[2];
    if (label) {
      attrs.set(label, attr);
    }
  }

  return attrs;
}

function runDataloadAndReturnObjects(
  store: s.Store,
  attrsStore: s.AttrsStore,
  { etype, pageInfo, dq, form },
) {
  const order = form?.$?.order;
  const isLeadingQuery = isLeading(form);
  const direction = determineDirection(form);

  let idVecs = datalogQuery(store, dq);

  const startCursor = pageInfo?.['start-cursor'];
  const orderAttr = getOrderAttr(attrsStore, etype, startCursor, order);

  if (orderAttr && orderAttr?.['forward-identity']?.[2] !== 'id') {
    const isDate = orderAttr['checked-data-type'] === 'date';
    const a = orderAttr.id;
    idVecs = idVecs.map(([id]) => {
      // order attr is required to be cardinality one, so there will
      // be at most one value here
      let v = store.eav.get(id)?.get(a)?.values()?.next()?.value?.[2];
      if (isDate) {
        v = comparableDate(v);
      }
      return [id, v];
    });
  }

  idVecs.sort(
    direction === 'asc'
      ? function compareIdVecs(a, b) {
          return compareOrderTriples(a, b, orderAttr?.['checked-data-type']);
        }
      : function compareIdVecs(a, b) {
          return compareOrderTriples(b, a, orderAttr?.['checked-data-type']);
        },
  );

  let objects = {};
  const attrs = objectAttrs(attrsStore, etype, dq);

  for (const idVec of idVecs) {
    const [id] = idVec;
    if (objects[id]) {
      continue;
    }
    if (
      !isLeadingQuery &&
      startCursor &&
      orderAttr &&
      isBefore(startCursor, orderAttr, direction, idVec)
    ) {
      continue;
    }

    const obj = s.getAsObject(store, attrs, id);
    if (obj) {
      objects[id] = obj;
    }
  }
  return objects;
}

function determineDirection(form) {
  const orderOpts = form.$?.order;
  if (!orderOpts) {
    return 'asc';
  }

  return orderOpts[Object.keys(orderOpts)[0]] || 'asc';
}

/**
 * A "leading" query has no `offset`, `before`, or `after`
 *
 * It is at the 'beginning' of the order
 */
function isLeading(form) {
  const offset = form.$?.offset;
  const before = form.$?.before;
  const after = form.$?.after;
  return !offset && !before && !after;
}

/**
 * Given a query like:
 *
 * {
 *   users: {
 *     $: { where: { name: "Joe" } },
 *   },
 * };
 *
 * `resolveObjects`, turns where clause: `{ name: "Joe" }`
 * into a datalog query. We then run the datalog query,
 * and reduce all the triples into objects.
 */
function resolveObjects(
  store: s.Store,
  attrsStore: s.AttrsStore,
  { etype, level, form, join, pageInfo },
) {
  // Wait for server to tell us where we start if we don't start from the beginning
  if (!isLeading(form) && (!pageInfo || !pageInfo['start-cursor'])) {
    return [];
  }

  const where = withJoin(
    makeWhere(attrsStore, etype, level, form.$?.where),
    join,
  );
  const find = makeFind(makeVarImpl, etype, level);
  const fields = form.$?.fields;

  const objs = runDataloadAndReturnObjects(store, attrsStore, {
    etype,
    pageInfo,
    form,
    dq: { where, find, fields },
  });

  const limit = form.$?.limit || form.$?.first || form.$?.last;
  if (limit != null) {
    if (level > 0) {
      console.warn(
        'WARNING: Limits in child queries are only run client-side. Data returned from the server will not have a limit.',
      );
    }

    const entries = Object.entries(objs);
    if (entries.length <= limit) {
      return objs;
    }
    return Object.fromEntries(entries.slice(0, limit));
  }

  return objs;
}

/**
 * It's possible that we query
 * for an attribute that doesn't exist yet.
 *
 * { users: { $: { where: { nonExistentProperty: "foo" } } } }
 *
 * This swallows the missing attr error and returns
 * an empty result instead
 */
function guardedResolveObjects(store: s.Store, attrsStore: s.AttrsStore, opts) {
  try {
    return resolveObjects(store, attrsStore, opts);
  } catch (e) {
    if (e instanceof AttrNotFoundError) {
      return {};
    }
    throw e;
  }
}
/**
 * Given a query like:
 *
 * {
 *   users: {
 *     $: { where: { name: "Joe" } },
 *     posts: {},
 *   },
 * };
 *
 * `guardResolveObjects` will return the relevant `users` objects
 * `extendObjects` will then extend each `user` object with relevant `posts`.
 */
function queryOne(store: s.Store, attrsStore: s.AttrsStore, opts) {
  const objects = guardedResolveObjects(store, attrsStore, opts);
  return extendObjects(makeVarImpl, store, attrsStore, opts, objects);
}

function formatPageInfo(
  pageInfo: Record<
    string,
    {
      'start-cursor'?: Cursor | null;
      'end-cursor'?: Cursor | null;
      'has-next-page?'?: boolean | null;
      'has-previous-page?'?: boolean | null;
    }
  >,
) {
  const res = {};
  for (const [k, v] of Object.entries(pageInfo)) {
    res[k] = {
      startCursor: v['start-cursor'],
      endCursor: v['end-cursor'],
      hasNextPage: v['has-next-page?'],
      hasPreviousPage: v['has-previous-page?'],
    };
  }
  return res;
}

export default function query(
  {
    store,
    attrsStore,
    pageInfo,
    aggregate,
  }: {
    store: s.Store;
    attrsStore: s.AttrsStore;
    pageInfo?: any;
    aggregate?: any;
  },
  q,
) {
  const data = Object.keys(q).reduce(function reduceResult(res, k) {
    if (aggregate?.[k] || '$$ruleParams' === k) {
      // Aggregate doesn't return any join rows and has no children,
      // so don't bother querying further
      return res;
    }
    res[k] = queryOne(store, attrsStore, {
      etype: k,
      form: q[k],
      level: 0,
      pageInfo: pageInfo?.[k],
    });
    return res;
  }, {});

  const result: { data: any; pageInfo?: any; aggregate?: any } = { data };
  if (pageInfo) {
    result.pageInfo = formatPageInfo(pageInfo);
  }

  if (aggregate) {
    result.aggregate = aggregate;
  }

  return result;
}

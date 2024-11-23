import { query as datalogQuery } from "./datalog";
import { uuidCompare } from "./utils/uuid";
import * as s from "./store";

// Pattern variables
// -----------------

let _seed = 0;

function wildcard(friendlyName) {
  return makeVarImpl(`_${friendlyName}`, _seed++);
}

function makeVarImpl(x, level) {
  return `?${x}-${level}`;
}

// Where
// -----------------

class AttrNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "AttrNotFoundError";
  }
}

function idAttr(store, ns) {
  const attr = s.getPrimaryKeyAttr(store, ns);

  if (!attr) {
    throw new AttrNotFoundError(`Could not find id attr for ${ns}`);
  }
  return attr;
}

function defaultWhere(makeVar, store, etype, level) {
  return [eidWhere(makeVar, store, etype, level)];
}

function eidWhere(makeVar, store, etype, level) {
  return [
    makeVar(etype, level),
    idAttr(store, etype).id,
    makeVar(etype, level),
    makeVar("time", level),
  ];
}

function replaceInAttrPat(attrPat, needle, v) {
  return attrPat.map((x) => (x === needle ? v : x));
}

function refAttrPat(makeVar, store, etype, level, label) {
  const fwdAttr = s.getAttrByFwdIdentName(store, etype, label);
  const revAttr = s.getAttrByReverseIdentName(store, etype, label);
  const attr = fwdAttr || revAttr;

  if (!attr) {
    throw new AttrNotFoundError(`Could not find attr for ${[etype, label]}`);
  }

  if (attr["value-type"] !== "ref") {
    throw new Error(`Attr ${attr.id} is not a ref`);
  }

  const [_f, fwdEtype] = attr["forward-identity"];
  const [_r, revEtype] = attr["reverse-identity"];
  const nextLevel = level + 1;
  const attrPat = fwdAttr
    ? [
        makeVar(fwdEtype, level),
        attr.id,
        makeVar(revEtype, nextLevel),
        wildcard("time"),
      ]
    : [
        makeVar(fwdEtype, nextLevel),
        attr.id,
        makeVar(revEtype, level),
        wildcard("time"),
      ];

  const nextEtype = fwdAttr ? revEtype : fwdEtype;

  const isForward = Boolean(fwdAttr);

  return [nextEtype, nextLevel, attrPat, attr, isForward];
}

function valueAttrPat(makeVar, store, valueEtype, valueLevel, valueLabel, v) {
  const fwdAttr = s.getAttrByFwdIdentName(store, valueEtype, valueLabel);
  const revAttr = s.getAttrByReverseIdentName(store, valueEtype, valueLabel);
  const attr = fwdAttr || revAttr;

  if (!attr) {
    throw new AttrNotFoundError(
      `No attr for etype = ${valueEtype} label = ${valueLabel}`,
    );
  }

  if (v?.hasOwnProperty("$isNull")) {
    const idAttr = s.getAttrByFwdIdentName(store, valueEtype, "id");
    if (!idAttr) {
      throw new AttrNotFoundError(
        `No attr for etype = ${valueEtype} label = id`,
      );
    }

    return [
      makeVar(valueEtype, valueLevel),
      idAttr.id,
      { $isNull: { attrId: attr.id, isNull: v.$isNull, reverse: !fwdAttr } },
      wildcard("time"),
    ];
  }
  if (fwdAttr) {
    return [makeVar(valueEtype, valueLevel), attr.id, v, wildcard("time")];
  }
  return [v, attr.id, makeVar(valueEtype, valueLevel), wildcard("time")];
}

function refAttrPats(makeVar, store, etype, level, refsPath) {
  const [lastEtype, lastLevel, attrPats] = refsPath.reduce(
    (acc, label) => {
      const [etype, level, attrPats] = acc;
      const [nextEtype, nextLevel, attrPat] = refAttrPat(
        makeVar,
        store,
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

function whereCondAttrPats(makeVar, store, etype, level, path, v) {
  const refsPath = path.slice(0, path.length - 1);
  const valueLabel = path[path.length - 1];
  const [lastEtype, lastLevel, refPats] = refAttrPats(
    makeVar,
    store,
    etype,
    level,
    refsPath,
  );
  const valuePat = valueAttrPat(
    makeVar,
    store,
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

function isOrClauses([k, v]) {
  return k === "or" && Array.isArray(v);
}

function isAndClauses([k, v]) {
  return k === "and" && Array.isArray(v);
}

// Creates a makeVar that will namespace symbols for or clauses
// to prevent conflicts, except for the base etype
function genMakeVar(baseMakeVar, etype, orIdx) {
  return (x, lvl) => {
    if (x == etype) {
      return baseMakeVar(x, lvl);
    }
    return `${baseMakeVar(x, lvl)}-${orIdx}`;
  };
}

function parseWhereClauses(
  makeVar,
  clauseType /* 'or' | 'and' */,
  store,
  etype,
  level,
  whereValue,
) {
  const patterns = whereValue.map((w, i) => {
    const makeNamespacedVar = genMakeVar(makeVar, etype, i);
    return parseWhere(makeNamespacedVar, store, etype, level, w);
  });
  const joinSym = makeVar(etype, level);
  return { [clauseType]: { patterns, joinSym } };
}

// Given a path, returns a list of paths leading up to this path:
// growPath([1, 2, 3]) -> [[1], [1, 2], [1, 2, 3]]
function growPath(path) {
  const ret = [];
  for (let i = 1; i <= path.length; i++) {
    ret.push(path.slice(0, i));
  }
  return ret;
}

// Returns array of pattern arrays that should be grouped in OR
// to capture any intermediate nulls
function whereCondAttrPatsForNullIsTrue(makeVar, store, etype, level, path) {
  return growPath(path).map((path) =>
    whereCondAttrPats(makeVar, store, etype, level, path, { $isNull: true }),
  );
}

function parseV(v) {
  if (
    typeof v !== "object" ||
    v.hasOwnProperty("$in") ||
    v.hasOwnProperty("in")
  ) {
    return v;
  }

  if (v.hasOwnProperty("$gt")) {
    return {
      $comparator: true,
      $op: function gt(triple) {
        return triple[2] > v.$gt;
      },
    };
  }
  if (v.hasOwnProperty("$gte")) {
    return {
      $comparator: true,
      $op: function gte(triple) {
        return triple[2] >= v.$gte;
      },
    };
  }

  if (v.hasOwnProperty("$lt")) {
    return {
      $comparator: true,
      $op: function lt(triple) {
        return triple[2] < v.$lt;
      },
    };
  }
  if (v.hasOwnProperty("$lte")) {
    return {
      $comparator: true,
      $op: function lte(triple) {
        return triple[2] <= v.$gte;
      },
    };
  }

  return v;
}

function parseWhere(makeVar, store, etype, level, where) {
  return Object.entries(where).flatMap(([k, v]) => {
    if (isOrClauses([k, v])) {
      return parseWhereClauses(makeVar, "or", store, etype, level, v);
    }
    if (isAndClauses([k, v])) {
      return parseWhereClauses(makeVar, "and", store, etype, level, v);
    }

    const path = k.split(".");

    if (v?.hasOwnProperty("$not")) {
      // `$not` won't pick up entities that are missing the attr, so we
      // add in a `$isNull` to catch those too.
      const notPats = whereCondAttrPats(makeVar, store, etype, level, path, v);
      const nilPats = whereCondAttrPatsForNullIsTrue(
        makeVar,
        store,
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

    if (v?.hasOwnProperty("$isNull") && v.$isNull === true && path.length > 1) {
      // Make sure we're capturing all of the intermediate paths that might be null
      // by checking for null at each step along the path
      return [
        {
          or: {
            patterns: whereCondAttrPatsForNullIsTrue(
              makeVar,
              store,
              etype,
              level,
              path,
            ),
            joinSym: makeVar(etype, level),
          },
        },
      ];
    }

    return whereCondAttrPats(makeVar, store, etype, level, path, parseV(v));
  });
}

function makeWhere(store, etype, level, where) {
  const makeVar = makeVarImpl;
  if (!where) {
    return defaultWhere(makeVar, store, etype, level);
  }
  const parsedWhere = parseWhere(makeVar, store, etype, level, where);
  return parsedWhere.concat(defaultWhere(makeVar, store, etype, level));
}

// Find
// -----------------

function makeFind(makeVar, etype, level) {
  return [makeVar(etype, level), makeVar("time", level)];
}

// extendObjects
// -----------------

function makeJoin(makeVar, store, etype, level, label, eid) {
  const [nextEtype, nextLevel, pat, attr, isForward] = refAttrPat(
    makeVar,
    store,
    etype,
    level,
    label,
  );
  const actualized = replaceInAttrPat(pat, makeVar(etype, level), eid);
  return [nextEtype, nextLevel, actualized, attr, isForward];
}

function extendObjects(makeVar, store, { etype, level, form }, objects) {
  const childQueries = Object.keys(form).filter((c) => c !== "$");
  if (!childQueries.length) {
    return Object.values(objects);
  }
  return Object.entries(objects).map(function extendChildren([eid, parent]) {
    const childResults = childQueries.map(function getChildResult(label) {
      const isSingular = Boolean(
        store.cardinalityInference &&
          store.linkIndex?.[etype]?.[label]?.isSingular,
      );

      try {
        const [nextEtype, nextLevel, join] = makeJoin(
          makeVar,
          store,
          etype,
          level,
          label,
          eid,
        );

        const childrenArray = queryOne(store, {
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
  return attr["value-type"] === "ref" && attr["forward-identity"][2] !== "id";
}

function cursorCompare(direction, typ) {
  switch (direction) {
    case "asc":
      switch (typ) {
        case "number":
          return (x, y) => x < y;
        case "uuid":
          return (x, y) => uuidCompare(x, y) === -1;
      }
    case "desc":
      switch (typ) {
        case "number":
          return (x, y) => x > y;
        case "uuid":
          return (x, y) => uuidCompare(x, y) === 1;
      }
  }
}

function isBefore(startCursor, direction, [e, _a, _v, t]) {
  return (
    cursorCompare(direction, "number")(t, startCursor[3]) ||
    (t === startCursor[3] &&
      cursorCompare(direction, "uuid")(e, startCursor[0]))
  );
}

function runDataloadAndReturnObjects(store, etype, direction, pageInfo, dq) {
  const aid = idAttr(store, etype).id;
  const idVecs = datalogQuery(store, dq).sort(function sortIdVecs(
    [_, tsA],
    [__, tsB],
  ) {
    return direction === "desc" ? tsB - tsA : tsA - tsB;
  });

  let objects = {};
  const startCursor = pageInfo?.["start-cursor"];
  for (const [id, time] of idVecs) {
    if (
      startCursor &&
      aid === startCursor[1] &&
      isBefore(startCursor, direction, [id, aid, id, time])
    ) {
      continue;
    }
    const obj = s.getAsObject(store, etype, id);
    if (obj) {
      objects[id] = obj;
    }
  }
  return objects;
}

function determineOrder(form) {
  const orderOpts = form.$?.order;
  if (!orderOpts) {
    return "asc";
  }

  return orderOpts[Object.keys(orderOpts)[0]] || "asc";
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
function resolveObjects(store, { etype, level, form, join, pageInfo }) {
  const limit = form.$?.limit || form.$?.first || form.$?.last;
  const offset = form.$?.offset;
  const before = form.$?.before;
  const after = form.$?.after;

  // Wait for server to tell us where we start if we don't start from the beginning
  if ((offset || before || after) && (!pageInfo || !pageInfo["start-cursor"])) {
    return [];
  }
  const where = withJoin(makeWhere(store, etype, level, form.$?.where), join);

  const find = makeFind(makeVarImpl, etype, level);

  const objs = runDataloadAndReturnObjects(
    store,
    etype,
    determineOrder(form),
    pageInfo,
    { where, find },
  );

  if (limit != null) {
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
function guardedResolveObjects(store, opts) {
  try {
    return resolveObjects(store, opts);
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
function queryOne(store, opts) {
  const objects = guardedResolveObjects(store, opts);
  return extendObjects(makeVarImpl, store, opts, objects);
}

function formatPageInfo(pageInfo) {
  const res = {};
  for (const [k, v] of Object.entries(pageInfo)) {
    res[k] = {
      startCursor: v["start-cursor"],
      endCursor: v["end-cursor"],
      hasNextPage: v["has-next-page?"],
      hasPreviousPage: v["has-previous-page?"],
    };
  }
  return res;
}

export default function query({ store, pageInfo, aggregate }, q) {
  const data = Object.keys(q).reduce(function reduceResult(res, k) {
    if (aggregate?.[k]) {
      // Aggregate doesn't return any join rows and has no children,
      // so don't bother querying further
      return res;
    }
    res[k] = queryOne(store, {
      etype: k,
      form: q[k],
      level: 0,
      pageInfo: pageInfo?.[k],
    });
    return res;
  }, {});

  const result = { data };
  if (pageInfo) {
    result.pageInfo = formatPageInfo(pageInfo);
  }

  if (aggregate) {
    result.aggregate = aggregate;
  }

  return result;
}

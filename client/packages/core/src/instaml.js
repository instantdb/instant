import { getOps, isLookup, parseLookup } from "./instatx";
import { immutableDeepReplace } from "./utils/object";
import uuid from "./utils/uuid";
import { isBlob } from "./store";

// Rewrites optimistic attrs with the attrs we get back from the server.
export function rewriteStep(attrMapping, txStep) {
  const { attrIdMap, refSwapAttrIds } = attrMapping;
  const rewritten = [];
  for (const part of txStep) {
    const newValue = attrIdMap[part];

    if (newValue) {
      // Rewrites attr id
      rewritten.push(newValue);
    } else if (Array.isArray(part) && part.length == 2 && attrIdMap[part[0]]) {
      // Rewrites attr id in lookups
      const [aid, value] = part;
      rewritten.push([attrIdMap[aid], value]);
    } else {
      rewritten.push(part);
    }
  }
  const [action] = txStep;
  if (
    (action === "add-triple" || action === "retract-triple") &&
    refSwapAttrIds.has(txStep[2])
  ) {
    // Reverse links if the optimistic link attr is backwards
    const tmp = rewritten[1];
    rewritten[1] = rewritten[3];
    rewritten[3] = tmp;
  }
  return rewritten;
}

export function blobAttrs2(store, etype) {
  if (!store.__blobAttrsIdx) {
    store.__blobAttrsIdx = Object.values(store.attrs).reduce((acc, attr) => {
      if (isBlob(attr)) {
        const etype = attr["forward-identity"][1];
        if (!acc[etype]) {
          acc[etype] = [];
        }
        acc[etype].push(attr);
      }
      return acc;
    }, {});
  }
  return store.__blobAttrsIdx[etype] || [];
}

export function blobAttrs({ attrs }, etype) {
  return Object.values(attrs).filter(
    (attr) => isBlob(attr) && attr["forward-identity"][1] === etype,
  );
}

export function getPrimaryKeyAttr2(store, ns) {
  if (!store.__primaryKeyAttrIdx) {
    store.__primaryKeyAttrIdx = Object.values(store.attrs).reduce(
      (acc, attr) => {
        if (attr["primary?"]) {
          acc[attr["forward-identity"][1]] = attr;
        }
        return acc;
      },
      {},
    );
  }
  const primA = store.__primaryKeyAttrIdx[ns];
  if (primA) {
    return primA;
  }
  return getAttrByFwdIdentName2(store, ns, "id");
}

export function getPrimaryKeyAttr(store, ns) {
  const primary = Object.values(store.attrs).find(
    (a) => a["primary?"] && a["forward-identity"]?.[1] === ns,
  );

  if (primary) {
    return primary;
  }
  return getAttrByFwdIdentName2(store, ns, "id");
}

export function getAttrByFwdIdentName2(store, inputEtype, inputIdentName) {
  if (!store.__attrsFwdIdx) {
    store.__attrsFwdIdx = Object.values(store.attrs).reduce((acc, attr) => {
      const [_id, etype, label] = attr["forward-identity"];
      if (!acc[etype]) {
        acc[etype] = {};
      }
      acc[etype][label] = attr;
      return acc;
    }, {});
  }
  // const fwdA = getAttrByFwdIdentName(store.attrs, inputEtype, inputIdentName);
  const fwdB = store.__attrsFwdIdx[inputEtype]?.[inputIdentName];
  return fwdB;
}

export function getAttrByFwdIdentName(attrs, inputEtype, inputIdentName) {
  return Object.values(attrs).find((attr) => {
    const [_id, etype, label] = attr["forward-identity"];
    return etype === inputEtype && label === inputIdentName;
  });
}

export function getAttrByReverseIdentName2(store, inputEtype, inputIdentName) {
  if (!store.__attrsRevIdx) {
    store.__attrsRevIdx = Object.values(store.attrs).reduce((acc, attr) => {
      if (!attr["reverse-identity"]) {
        return acc;
      }
      const [_id, etype, label] = attr["reverse-identity"];
      if (!acc[etype]) {
        acc[etype] = {};
      }
      acc[etype][label] = attr;
      return acc;
    }, {});
  }
  return store.__attrsRevIdx[inputEtype]?.[inputIdentName];
}

export function getAttrByReverseIdentName(attrs, inputEtype, inputIdentName) {
  return Object.values(attrs).find((attr) => {
    const revIdent = attr["reverse-identity"];
    if (!revIdent) return false;
    const [_id, etype, label] = revIdent;
    return etype === inputEtype && label === inputIdentName;
  });
}

function explodeLookupRef(eid) {
  if (Array.isArray(eid)) {
    return eid;
  }
  const entries = Object.entries(eid);
  if (entries.length !== 1) {
    throw new Error(
      "lookup must be an object with a single unique attr and value.",
    );
  }
  return entries[0];
}

function isRefLookupIdent(attrs, etype, identName) {
  return (
    identName.indexOf(".") !== -1 &&
    // attr names can have `.` in them, so use the attr we find with a `.`
    // before assuming it's a ref lookup.
    !getAttrByFwdIdentName(attrs, etype, identName)
  );
}

function extractRefLookupFwdName(identName) {
  const [fwdName, idIdent, ...rest] = identName.split(".");
  if (rest.length > 0 || idIdent !== "id") {
    throw new Error(`${identName} is not a valid lookup attribute.`);
  }

  return fwdName;
}

function lookupIdentToAttr(attrs, etype, identName) {
  if (!isRefLookupIdent(attrs, etype, identName)) {
    return getAttrByFwdIdentName(attrs, etype, identName);
  }

  const fwdName = extractRefLookupFwdName(identName);

  const refAttr =
    getAttrByFwdIdentName(attrs, etype, fwdName) ||
    getAttrByReverseIdentName(attrs, etype, fwdName);
  if (refAttr && refAttr["value-type"] !== "ref") {
    throw new Error(`${identName} does not reference a valid link attribute.`);
  }
  return refAttr;
}

// Returns [attr, value] for the eid if the eid is a lookup.
// If it's a regular eid, returns null
function lookupPairOfEid(eid) {
  if (typeof eid === "string" && !isLookup(eid)) {
    return null;
  }
  return typeof eid === "string" && isLookup(eid)
    ? parseLookup(eid)
    : explodeLookupRef(eid);
}

function extractLookup(attrs, etype, eid) {
  const lookupPair = lookupPairOfEid(eid);

  if (lookupPair === null) {
    return eid;
  }

  const [identName, value] = lookupPair;
  const attr = lookupIdentToAttr(attrs, etype, identName);
  if (!attr || !attr["unique?"]) {
    throw new Error(`${identName} is not a unique attribute.`);
  }
  return [attr.id, value];
}

function expandLink(attrs, [etype, eidA, obj]) {
  const addTriples = Object.entries(obj).flatMap(([label, eidOrEids]) => {
    const eids = Array.isArray(eidOrEids) ? eidOrEids : [eidOrEids];
    const fwdAttr = getAttrByFwdIdentName(attrs, etype, label);
    const revAttr = getAttrByReverseIdentName(attrs, etype, label);
    return eids.map((eidB) => {
      const txStep = fwdAttr
        ? [
            "add-triple",
            extractLookup(attrs, etype, eidA),
            fwdAttr.id,
            extractLookup(attrs, fwdAttr["reverse-identity"][1], eidB),
          ]
        : [
            "add-triple",
            extractLookup(attrs, revAttr["forward-identity"][1], eidB),
            revAttr.id,
            extractLookup(attrs, etype, eidA),
          ];
      return txStep;
    });
  });
  return addTriples;
}

function expandUnlink(attrs, [etype, eidA, obj]) {
  const retractTriples = Object.entries(obj).flatMap(([label, eidOrEids]) => {
    const eids = Array.isArray(eidOrEids) ? eidOrEids : [eidOrEids];
    const fwdAttr = getAttrByFwdIdentName(attrs, etype, label);
    const revAttr = getAttrByReverseIdentName(attrs, etype, label);
    return eids.map((eidB) => {
      const txStep = fwdAttr
        ? [
            "retract-triple",
            extractLookup(attrs, etype, eidA),
            fwdAttr.id,
            extractLookup(attrs, fwdAttr["reverse-identity"][1], eidB),
          ]
        : [
            "retract-triple",
            extractLookup(attrs, revAttr["forward-identity"][1], eidB),
            revAttr.id,
            extractLookup(attrs, etype, eidA),
          ];
      return txStep;
    });
  });
  return retractTriples;
}

function expandUpdate(attrs, [etype, eid, obj]) {
  const lookup = extractLookup(attrs, etype, eid);
  // id first so that we don't clobber updates on the lookup field
  const attrTuples = [["id", extractLookup(attrs, etype, eid)]]
    .concat(Object.entries(obj))
    .map(([identName, value]) => {
      const attr = getAttrByFwdIdentName(attrs, etype, identName);
      return ["add-triple", lookup, attr.id, value];
    });
  return attrTuples;
}

function expandDelete(attrs, [etype, eid]) {
  const lookup = extractLookup(attrs, etype, eid);
  return [["delete-entity", lookup, etype]];
}

function expandDeepMerge(attrs, [etype, eid, obj]) {
  const lookup = extractLookup(attrs, etype, eid);
  const attrTuples = Object.entries(obj).map(([identName, value]) => {
    const attr = getAttrByFwdIdentName(attrs, etype, identName);
    const coercedValue = immutableDeepReplace(value, undefined, null);
    return ["deep-merge-triple", lookup, attr.id, coercedValue];
  });

  const idTuple = [
    "add-triple",
    lookup,
    getAttrByFwdIdentName(attrs, etype, "id").id,
    lookup,
  ];

  // id first so that we don't clobber updates on the lookup field
  return [idTuple].concat(attrTuples);
}
function removeIdFromArgs(step) {
  const [op, etype, eid, obj] = step;
  if (!obj) {
    return step;
  }
  const newObj = { ...obj };
  delete newObj.id;
  return [op, etype, eid, newObj];
}

function toTxSteps(attrs, step) {
  const [action, ...args] = removeIdFromArgs(step);
  switch (action) {
    case "merge":
      return expandDeepMerge(attrs, args);
    case "update":
      return expandUpdate(attrs, args);
    case "link":
      return expandLink(attrs, args);
    case "unlink":
      return expandUnlink(attrs, args);
    case "delete":
      return expandDelete(attrs, args);
    default:
      throw new Error(`unsupported action ${action}`);
  }
}

// ---------
// transform

function createObjectAttr(etype, label, props) {
  const attrId = uuid();
  const fwdIdentId = uuid();
  const fwdIdent = [fwdIdentId, etype, label];
  return {
    id: attrId,
    "forward-identity": fwdIdent,
    "value-type": "blob",
    cardinality: "one",
    "unique?": false,
    "index?": false,
    isUnsynced: true,
    ...(props || {}),
  };
}

function createRefAttr(etype, label, props) {
  const attrId = uuid();
  const fwdIdentId = uuid();
  const revIdentId = uuid();
  const fwdIdent = [fwdIdentId, etype, label];
  const revIdent = [revIdentId, label, etype];
  return {
    id: attrId,
    "forward-identity": fwdIdent,
    "reverse-identity": revIdent,
    "value-type": "ref",
    cardinality: "many",
    "unique?": false,
    "index?": false,
    isUnsynced: true,
    ...(props || {}),
  };
}

// Actions that have an object, e.g. not delete
const OBJ_ACTIONS = new Set(["update", "merge", "link", "unlink"]);
const REF_ACTIONS = new Set(["link", "unlink"]);
const UPDATE_ACTIONS = new Set(["update", "merge"]);
const SUPPORTS_LOOKUP_ACTIONS = new Set([
  "link",
  "unlink",
  "update",
  "merge",
  "delete",
]);

const lookupProps = { "unique?": true, "index?": true };
const refLookupProps = { ...lookupProps, cardinality: "one" };

function lookupPairsOfOp(op) {
  const res = [];
  const [action, etype, eid, obj] = op;
  if (!SUPPORTS_LOOKUP_ACTIONS.has(action)) {
    return res;
  }

  const eidLookupPair = lookupPairOfEid(eid);
  if (eidLookupPair) {
    res.push({ etype: etype, lookupPair: eidLookupPair });
  }
  if (action === "link") {
    for (const [label, eidOrEids] of Object.entries(obj)) {
      const eids = Array.isArray(eidOrEids) ? eidOrEids : [eidOrEids];
      for (const linkEid of eids) {
        const linkEidLookupPair = lookupPairOfEid(linkEid);
        if (linkEidLookupPair) {
          res.push({
            etype: etype,
            lookupPair: linkEidLookupPair,
            linkLabel: label,
          });
        }
      }
    }
  }
  return res;
}

function createMissingAttrs(existingAttrs, ops) {
  const [addedIds, attrs, addOps] = [new Set(), { ...existingAttrs }, []];
  function addAttr(attr) {
    attrs[attr.id] = attr;
    addOps.push(["add-attr", attr]);
    addedIds.add(attr.id);
  }
  function addUnsynced(attr) {
    if (attr?.isUnsynced && !addedIds.has(attr.id)) {
      addOps.push(["add-attr", attr]);
      addedIds.add(attr.id);
    }
  }

  // Adds attrs needed for a ref lookup
  function addForRef(etype, label) {
    const fwdAttr = getAttrByFwdIdentName(attrs, etype, label);
    const revAttr = getAttrByReverseIdentName(attrs, etype, label);
    addUnsynced(fwdAttr);
    addUnsynced(revAttr);
    if (!fwdAttr && !revAttr) {
      addAttr(createRefAttr(etype, label, refLookupProps));
    }
  }

  // Create attrs for lookups if we need to
  // Do these first because otherwise we might add a non-unique attr
  // before we get to it
  for (const op of ops) {
    for (const { etype, lookupPair, linkLabel } of lookupPairsOfOp(op)) {
      const identName = lookupPair[0];
      // We got a link eid that's a lookup, linkLabel is the label of the ident,
      // e.g. `posts` in `link({posts: postIds})`
      if (linkLabel) {
        // Add our ref attr, e.g. users.posts
        addForRef(etype, linkLabel);

        // Figure out the link etype so we can make sure we have the attrs
        // for the link lookup
        const fwdAttr = getAttrByFwdIdentName(attrs, etype, linkLabel);
        const revAttr = getAttrByReverseIdentName(attrs, etype, linkLabel);
        addUnsynced(fwdAttr);
        addUnsynced(revAttr);
        const linkEtype =
          fwdAttr?.["reverse-identity"]?.[1] ||
          revAttr?.["forward-identity"]?.[1] ||
          linkLabel;
        if (isRefLookupIdent(attrs, linkEtype, identName)) {
          addForRef(linkEtype, extractRefLookupFwdName(identName));
        } else {
          const attr = getAttrByFwdIdentName(attrs, linkEtype, identName);
          if (!attr) {
            addAttr(createObjectAttr(linkEtype, identName, lookupProps));
          }
          addUnsynced(attr);
        }
      } else if (isRefLookupIdent(attrs, etype, identName)) {
        addForRef(etype, extractRefLookupFwdName(identName));
      } else {
        const attr = getAttrByFwdIdentName(attrs, etype, identName);
        if (!attr) {
          addAttr(createObjectAttr(etype, identName, lookupProps));
        }
        addUnsynced(attr);
      }
    }
  }

  // Create object and ref attrs
  for (const op of ops) {
    const [action, etype, eid, obj] = op;
    if (OBJ_ACTIONS.has(action)) {
      const labels = Object.keys(obj);
      labels.push("id");
      for (const label of labels) {
        const fwdAttr = getAttrByFwdIdentName(attrs, etype, label);
        addUnsynced(fwdAttr);
        if (UPDATE_ACTIONS.has(action)) {
          if (!fwdAttr) {
            addAttr(
              createObjectAttr(
                etype,
                label,
                label === "id" ? { "unique?": true } : null,
              ),
            );
          }
        }
        if (REF_ACTIONS.has(action)) {
          const revAttr = getAttrByReverseIdentName(attrs, etype, label);
          if (!fwdAttr && !revAttr) {
            addAttr(createRefAttr(etype, label));
          }
          addUnsynced(revAttr);
        }
      }
    }
  }
  return [attrs, addOps];
}

export function transform(attrs, inputChunks) {
  const chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];
  const ops = chunks.flatMap((tx) => getOps(tx));
  const [newAttrs, addAttrTxSteps] = createMissingAttrs(attrs, ops);
  const txSteps = ops.flatMap((op) => toTxSteps(newAttrs, op));
  return [...addAttrTxSteps, ...txSteps];
}

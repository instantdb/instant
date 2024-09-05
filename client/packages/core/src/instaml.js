import { getOps, isLookup, parseLookup } from "./instatx";
import { immutableDeepReplace } from "./utils/object";
import uuid from "./utils/uuid";

export function getAttrByFwdIdentName(attrs, inputEtype, inputIdentName) {
  return Object.values(attrs).find((attr) => {
    const [_id, etype, label] = attr["forward-identity"];
    return etype === inputEtype && label === inputIdentName;
  });
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

function isRefLookupIdent(identName) {
  return identName.indexOf(".") !== -1;
}

function extractRefLookupFwdName(identName) {
  const [fwdName, idIdent, ...rest] = identName.split(".");
  if (rest.length > 0 || idIdent !== "id") {
    throw new Error(`${identName} is not a valid attribute.`);
  }

  return fwdName;
}

function lookupIdentToAttr(attrs, etype, identName) {
  if (!isRefLookupIdent(identName)) {
    return getAttrByFwdIdentName(attrs, etype, identName);
  }

  const fwdName = extractRefLookupFwdName(identName);

  const refAttr = getAttrByFwdIdentName(attrs, etype, fwdName);
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
  const attrTuples = Object.entries(obj)
    .concat([["id", extractLookup(attrs, etype, eid)]])
    .map(([identName, value]) => {
      const attr = getAttrByFwdIdentName(attrs, etype, identName);
      return ["add-triple", lookup, attr.id, value];
    });
  return attrTuples;
}

function expandDelete(attrs, [etype, eid]) {
  const lookup = extractLookup(attrs, etype, eid);
  return [["delete-entity", lookup]];
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

  return attrTuples.concat([idTuple]);
}

function toTxSteps(attrs, [action, ...args]) {
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

const lookupProps = { "unique?": true, "index?": true };
const refLookupProps = { ...lookupProps, cardinality: "one" };

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
  for (const op of ops) {
    const [action, etype, eid, obj] = op;
    if (OBJ_ACTIONS.has(action)) {
      const labels = Object.keys(obj);
      labels.push("id");
      // Create object and ref attrs
      for (const label of labels) {
        const fwdAttr = getAttrByFwdIdentName(attrs, etype, label);
        addUnsynced(fwdAttr);
        if (UPDATE_ACTIONS.has(action)) {
          if (!fwdAttr) {
            addAttr(createObjectAttr(etype, label));
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

    // Create attrs for lookups if we need to
    const lookupPair = lookupPairOfEid(eid);
    if (lookupPair) {
      const identName = lookupPair[0];
      if (isRefLookupIdent(identName)) {
        const label = extractRefLookupFwdName(identName);
        const fwdAttr = getAttrByFwdIdentName(attrs, etype, label);
        const revAttr = getAttrByReverseIdentName(attrs, etype, label);
        if (!fwdAttr && !revAttr) {
          addAttr(createRefAttr(etype, label, refLookupProps));
        }
        addUnsynced(fwdAttr);
        addUnsynced(revAttr);
      } else {
        const attr = getAttrByFwdIdentName(attrs, etype, identName);
        if (!attr) {
          addAttr(createObjectAttr(etype, identName, lookupProps));
        }
        addUnsynced(attr);
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

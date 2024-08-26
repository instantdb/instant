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
  const attr = getAttrByFwdIdentName(attrs, etype, identName);
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

function extractIdents([_action, etype, eid, obj]) {
  const ks = new Set(Object.keys(obj).concat("id"));
  const idents = [...ks].map((label) => [etype, label]);
  const lookupPair = lookupPairOfEid(eid);
  if (lookupPair) {
    idents.push([etype, lookupPair[0], { "unique?": true, "index?": true }]);
  }
  return idents;
}

function createObjectAttr([etype, label, props]) {
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

function createRefAttr([etype, label]) {
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
  };
}

function uniqueIdents(idents) {
  const seen = new Set();
  const acc = [];
  idents.forEach((ident) => {
    const [etype, label] = ident;
    const key = `${etype}:${label}`;
    if (!seen.has(key)) {
      seen.add(key);
      acc.push(ident);
    }
  });
  return acc;
}

function createMissingObjectAttrs(attrs, ops) {
  const objectOps = ops.filter(
    ([action]) => action === "update" || action === "merge",
  );
  const objectIdents = uniqueIdents(objectOps.flatMap(extractIdents));
  const missingIdents = objectIdents.filter(
    ([etype, label]) => !getAttrByFwdIdentName(attrs, etype, label),
  );
  const objectAttrs = missingIdents.map(createObjectAttr);
  const newAttrs = objectAttrs.reduce(
    (acc, attr) => {
      acc[attr.id] = attr;
      return acc;
    },
    { ...attrs },
  );
  const attrTxSteps = objectAttrs.map((attr) => ["add-attr", attr]);

  const localAttrs = objectIdents.flatMap(([etype, label]) => {
    const ret = [];
    const attr = getAttrByFwdIdentName(attrs, etype, label);
    if (attr?.isUnsynced) {
      ret.push(attr);
    }
    return ret;
  });
  const localAttrTxSteps = localAttrs.map((attr) => ["add-attr", attr]);

  const txSteps = [...attrTxSteps, ...localAttrTxSteps];
  return [newAttrs, txSteps];
}

function createMissingRefAttrs(attrs, ops) {
  const objectOps = ops.filter(
    ([action]) => action === "link" || action === "unlink",
  );
  const objectIdents = uniqueIdents(objectOps.flatMap(extractIdents));
  const missingIdents = objectIdents.filter(
    ([etype, label]) =>
      !getAttrByFwdIdentName(attrs, etype, label) &&
      !getAttrByReverseIdentName(attrs, etype, label),
  );
  const refAttrs = missingIdents.map(createRefAttr);
  const newAttrs = refAttrs.reduce(
    (acc, attr) => {
      acc[attr.id] = attr;
      return acc;
    },
    { ...attrs },
  );
  const attrTxSteps = refAttrs.map((attr) => ["add-attr", attr]);

  const localAttrs = objectIdents.flatMap(([etype, label]) => {
    const ret = [];
    const fwdAttr = getAttrByFwdIdentName(attrs, etype, label);
    const revAttr = getAttrByReverseIdentName(attrs, etype, label);
    if (fwdAttr?.isUnsynced) {
      ret.push(fwdAttr);
    }
    if (revAttr?.isUnsynced) {
      ret.push(revAttr);
    }
    return ret;
  });
  const localAttrTxSteps = localAttrs.map((attr) => ["add-attr", attr]);

  const txSteps = [...attrTxSteps, ...localAttrTxSteps];
  return [newAttrs, txSteps];
}

export function transform(attrs, inputChunks) {
  const chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];
  const ops = chunks.flatMap((tx) => getOps(tx));
  const [withNewObjAttrs, addObjAttrTxSteps] = createMissingObjectAttrs(
    attrs,
    ops,
  );
  const [withNewRefAttrs, addRefAttrTxSteps] = createMissingRefAttrs(
    withNewObjAttrs,
    ops,
  );
  const txSteps = ops.flatMap((op) => toTxSteps(withNewRefAttrs, op));
  return [...addObjAttrTxSteps, ...addRefAttrTxSteps, ...txSteps];
}

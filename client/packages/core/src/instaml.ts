import {
  allMapValues,
  AttrsStore,
  AttrsStoreClass,
  getAttrByFwdIdentName,
  getAttrByReverseIdentName,
  Store,
} from './store.ts';
import { getOps, isLookup, parseLookup } from './instatx.ts';
import { immutableRemoveUndefined } from './utils/object.js';
import { coerceToDate } from './utils/dates.ts';
import uuid from './utils/id.ts';
import {
  EntitiesWithLinks,
  IContainEntitiesAndLinks,
  LinkDef,
} from './schemaTypes.ts';
import { InstantDBAttr, InstantDBIdent } from './attrTypes.ts';

export type AttrMapping = {
  attrIdMap: Record<string, string>;
  refSwapAttrIds: Set<string>;
};

type TXStep = any[];

// Rewrites optimistic attrs with the attrs we get back from the server.
export function rewriteStep(attrMapping: AttrMapping, txStep: TXStep): TXStep {
  const { attrIdMap, refSwapAttrIds } = attrMapping;
  const rewritten: TXStep = [];
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
    (action === 'add-triple' || action === 'retract-triple') &&
    refSwapAttrIds.has(txStep[2])
  ) {
    // Reverse links if the optimistic link attr is backwards
    const tmp = rewritten[1];
    rewritten[1] = rewritten[3];
    rewritten[3] = tmp;
  }
  return rewritten;
}

function explodeLookupRef(eid) {
  if (Array.isArray(eid)) {
    return eid;
  }
  const entries = Object.entries(eid);
  if (entries.length !== 1) {
    throw new Error(
      'lookup must be an object with a single unique attr and value.',
    );
  }
  return entries[0];
}

function isRefLookupIdent(attrs: AttrsStore, etype: string, identName: string) {
  return (
    identName.indexOf('.') !== -1 &&
    // attr names can have `.` in them, so use the attr we find with a `.`
    // before assuming it's a ref lookup.
    !getAttrByFwdIdentName(attrs, etype, identName)
  );
}

function extractRefLookupFwdName(identName) {
  const [fwdName, idIdent, ...rest] = identName.split('.');
  if (rest.length > 0 || idIdent !== 'id') {
    throw new Error(`${identName} is not a valid lookup attribute.`);
  }

  return fwdName;
}

function lookupIdentToAttr(
  attrs: AttrsStore,
  etype: string,
  identName: string,
) {
  if (!isRefLookupIdent(attrs, etype, identName)) {
    return getAttrByFwdIdentName(attrs, etype, identName);
  }

  const fwdName = extractRefLookupFwdName(identName);

  const refAttr =
    getAttrByFwdIdentName(attrs, etype, fwdName) ||
    getAttrByReverseIdentName(attrs, etype, fwdName);
  if (refAttr && refAttr['value-type'] !== 'ref') {
    throw new Error(`${identName} does not reference a valid link attribute.`);
  }
  return refAttr;
}

// Returns [attr, value] for the eid if the eid is a lookup.
// If it's a regular eid, returns null
function lookupPairOfEid(eid) {
  if (typeof eid === 'string' && !isLookup(eid)) {
    return null;
  }
  return typeof eid === 'string' && isLookup(eid)
    ? parseLookup(eid)
    : explodeLookupRef(eid);
}

function extractLookup(attrs: AttrsStore, etype: string, eid: string) {
  const lookupPair = lookupPairOfEid(eid);

  if (lookupPair === null) {
    return eid;
  }

  const [identName, value] = lookupPair;
  const attr = lookupIdentToAttr(attrs, etype, identName);
  if (!attr || !attr['unique?']) {
    throw new Error(`${identName} is not a unique attribute.`);
  }
  return [attr.id, value];
}

function withIdAttrForLookup(
  attrs: AttrsStore,
  etype: string,
  eidA: string,
  txSteps: TXStep[],
) {
  const lookup = extractLookup(attrs, etype, eidA);
  if (!Array.isArray(lookup)) {
    return txSteps;
  }
  const idTuple = [
    'add-triple',
    lookup,
    getAttrByFwdIdentName(attrs, etype, 'id')?.id,
    lookup,
  ];
  return [idTuple].concat(txSteps);
}

function expandLink({ attrsStore }: Ctx, [etype, eidA, obj]) {
  const addTriples = Object.entries(obj).flatMap(([label, eidOrEids]) => {
    const eids = Array.isArray(eidOrEids) ? eidOrEids : [eidOrEids];
    const fwdAttr = getAttrByFwdIdentName(attrsStore, etype, label);
    const revAttr = getAttrByReverseIdentName(attrsStore, etype, label);
    return eids.map((eidB) => {
      const txStep = fwdAttr
        ? [
            'add-triple',
            extractLookup(attrsStore, etype, eidA),
            fwdAttr.id,
            // Uses `!` because if we get here, we should have created the attr if it doesn't
            // already exist
            extractLookup(attrsStore, fwdAttr['reverse-identity']![1], eidB),
          ]
        : [
            'add-triple',
            // Uses `!` because if we get here, we should have created the attr if it doesn't
            // already exist
            extractLookup(attrsStore, revAttr!['forward-identity']![1], eidB),
            revAttr?.id,
            extractLookup(attrsStore, etype, eidA),
          ];
      return txStep;
    });
  });
  return withIdAttrForLookup(attrsStore, etype, eidA, addTriples);
}

function expandUnlink({ attrsStore }: Ctx, [etype, eidA, obj]) {
  const retractTriples = Object.entries(obj).flatMap(([label, eidOrEids]) => {
    const eids = Array.isArray(eidOrEids) ? eidOrEids : [eidOrEids];
    const fwdAttr = getAttrByFwdIdentName(attrsStore, etype, label);
    const revAttr = getAttrByReverseIdentName(attrsStore, etype, label);
    return eids.map((eidB) => {
      const txStep = fwdAttr
        ? [
            'retract-triple',
            extractLookup(attrsStore, etype, eidA),
            fwdAttr.id,
            // Uses `!` because if we get here, we should have created the attr if it doesn't
            // already exist
            extractLookup(attrsStore, fwdAttr!['reverse-identity']![1], eidB),
          ]
        : [
            'retract-triple',
            // Uses `!` because if we get here, we should have created the attr if it doesn't
            // already exist
            extractLookup(attrsStore, revAttr!['forward-identity'][1], eidB),
            revAttr!.id,
            extractLookup(attrsStore, etype, eidA),
          ];
      return txStep;
    });
  });
  return withIdAttrForLookup(attrsStore, etype, eidA, retractTriples);
}

function checkEntityExists(
  stores: (Store | undefined)[] | undefined,
  attrsStore: AttrsStore,
  etype: string,
  eid: string,
) {
  if (Array.isArray(eid)) {
    // lookup ref
    const [entity_a, entity_v] = eid;
    for (const store of stores || []) {
      const ev = store?.aev.get(entity_a);
      if (ev) {
        // This would be a lot more efficient with a ave index
        for (const [_e, _a, v] of allMapValues(ev, 2)) {
          if (v === entity_v) {
            return true;
          }
        }
      }
    }
  } else {
    // eid
    for (const store of stores || []) {
      const av = store?.eav.get(eid);
      if (av) {
        for (const attr_id of av.keys()) {
          if (attrsStore.getAttr(attr_id)?.['forward-identity'][1] == etype) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

type Ctx = {
  stores?: (Store | undefined)[];
  attrsStore: AttrsStore;
  schema?: Schema;
  useDateObjects?: boolean | null;
};

function convertOpts({ stores, attrsStore }: Ctx, [etype, eid, obj_, opts]) {
  return opts?.upsert === false
    ? { mode: 'update' }
    : opts?.upsert === true
      ? null
      : checkEntityExists(stores, attrsStore, etype, eid)
        ? { mode: 'update' }
        : null; // auto mode chooses between update and upsert, not update and create, just in case
}

function expandCreate(ctx: Ctx, step) {
  const { attrsStore } = ctx;
  const [etype, eid, obj_, opts] = step;
  const obj = immutableRemoveUndefined(obj_);
  const lookup = extractLookup(attrsStore, etype, eid);
  // id first so that we don't clobber updates on the lookup field
  const attrTuples = [['id', lookup]]
    .concat(Object.entries(obj))
    .map(([identName, value]: [string, any]) => {
      // Uses `!` because we should have optimistically created the attr if it doesn't exist
      const attr = getAttrByFwdIdentName(attrsStore, etype, identName)!;

      if (attr['checked-data-type'] === 'date' && ctx.useDateObjects) {
        value = coerceToDate(value);
      }

      return ['add-triple', lookup, attr.id, value, { mode: 'create' }];
    });
  return attrTuples;
}

function expandUpdate(ctx: Ctx, step) {
  const { attrsStore } = ctx;
  const [etype, eid, obj_, opts] = step;
  const obj = immutableRemoveUndefined(obj_);
  const lookup = extractLookup(attrsStore, etype, eid);
  const serverOpts = convertOpts(ctx, [etype, lookup, obj_, opts]);
  // id first so that we don't clobber updates on the lookup field
  const attrTuples = [['id', lookup]]
    .concat(Object.entries(obj))
    .map(([identName, value]: [string, any]) => {
      const attr = getAttrByFwdIdentName(attrsStore, etype, identName)!;

      if (attr['checked-data-type'] === 'date' && ctx.useDateObjects) {
        value = coerceToDate(value);
      }

      return [
        'add-triple',
        lookup,
        attr.id,
        value,
        ...(serverOpts ? [serverOpts] : []),
      ];
    });
  return attrTuples;
}

function expandDelete({ attrsStore }: Ctx, [etype, eid]) {
  const lookup = extractLookup(attrsStore, etype, eid);
  return [['delete-entity', lookup, etype]];
}

function expandDeepMerge(ctx: Ctx, step) {
  const { attrsStore } = ctx;
  const [etype, eid, obj_, opts] = step;
  const obj = immutableRemoveUndefined(obj_);
  const lookup = extractLookup(attrsStore, etype, eid);
  const serverOpts = convertOpts(ctx, [etype, lookup, obj_, opts]);
  const attrTuples = Object.entries(obj).map(([identName, value]) => {
    const attr = getAttrByFwdIdentName(attrsStore, etype, identName)!;
    return [
      'deep-merge-triple',
      lookup,
      attr.id,
      value,
      ...(serverOpts ? [serverOpts] : []),
    ];
  });

  const idTuple = [
    'add-triple',
    lookup,
    getAttrByFwdIdentName(attrsStore, etype, 'id')!.id,
    lookup,
    ...(serverOpts ? [serverOpts] : []),
  ];

  // id first so that we don't clobber updates on the lookup field
  return [idTuple].concat(attrTuples);
}

function expandRuleParams({ attrsStore }: Ctx, [etype, eid, ruleParams]) {
  const lookup = extractLookup(attrsStore, etype, eid);
  return [['rule-params', lookup, etype, ruleParams]];
}

function removeIdFromArgs(step) {
  const [op, etype, eid, obj, opts] = step;
  if (!obj) {
    return step;
  }
  const newObj = { ...obj };
  delete newObj.id;
  return [op, etype, eid, newObj, ...(opts ? [opts] : [])];
}

function toTxSteps(ctx: Ctx, step) {
  const [action, ...args] = removeIdFromArgs(step);
  switch (action) {
    case 'merge':
      return expandDeepMerge(ctx, args);
    case 'create':
      return expandCreate(ctx, args);
    case 'update':
      return expandUpdate(ctx, args);
    case 'link':
      return expandLink(ctx, args);
    case 'unlink':
      return expandUnlink(ctx, args);
    case 'delete':
      return expandDelete(ctx, args);
    case 'ruleParams':
      return expandRuleParams(ctx, args);
    default:
      throw new Error(`unsupported action ${action}`);
  }
}

// ---------
// transform

function checkedDataTypeOfValueType(valueType) {
  switch (valueType) {
    case 'string':
    case 'date':
    case 'boolean':
    case 'number':
      return valueType;
    default:
      return undefined;
  }
}

function objectPropsFromSchema(schema, etype, label) {
  const attr = schema.entities[etype]?.attrs?.[label];
  if (label === 'id') return null;
  if (!attr) {
    throw new Error(`${etype}.${label} does not exist in your schema`);
  }
  const { unique, indexed } = attr?.config;
  const checkedDataType = checkedDataTypeOfValueType(attr?.valueType);

  return {
    'index?': indexed,
    'unique?': unique,
    'checked-data-type': checkedDataType,
  };
}

function createObjectAttr(schema, etype, label, props) {
  const schemaObjectProps = schema
    ? objectPropsFromSchema(schema, etype, label)
    : null;
  const attrId = uuid();
  const fwdIdentId = uuid();
  const fwdIdent = [fwdIdentId, etype, label];
  return {
    id: attrId,
    'forward-identity': fwdIdent,
    'value-type': 'blob',
    cardinality: 'one',
    'unique?': false,
    'index?': false,
    isUnsynced: true,
    ...(schemaObjectProps || {}),
    ...(props || {}),
  };
}

type Link = LinkDef<any, any, any, any, any, any, any>;
type Schema = IContainEntitiesAndLinks<any, any>;

function findSchemaLink(schema: Schema, etype, label): Link | undefined {
  const links: Link[] = Object.values(schema.links);
  const found = links.find((x: Link) => {
    return (
      (x.forward.on === etype && x.forward.label === label) ||
      (x.reverse.on === etype && x.reverse.label === label)
    );
  });
  return found;
}

function refPropsFromSchema(schema: Schema, etype, label) {
  const found = findSchemaLink(schema, etype, label);
  if (!found) {
    throw new Error(`Couldn't find the link ${etype}.${label} in your schema`);
  }
  const { forward, reverse } = found;
  return {
    'forward-identity': [uuid(), forward.on, forward.label],
    'reverse-identity': [uuid(), reverse.on, reverse.label],
    cardinality: forward.has === 'one' ? 'one' : 'many',
    'unique?': reverse.has === 'one',
    'on-delete': forward.onDelete,
    'on-delete-reverse': reverse.onDelete,
  };
}

function createRefAttr(
  schema: Schema | undefined,
  etype: string,
  label: string,
  props?: Partial<InstantDBAttr> | undefined,
): InstantDBAttr {
  const schemaRefProps = schema
    ? refPropsFromSchema(schema, etype, label)
    : null;
  const attrId = uuid();
  const fwdIdent: InstantDBIdent = [uuid(), etype, label];
  const revIdent: InstantDBIdent = [uuid(), label, etype];
  return {
    id: attrId,
    // @ts-ignore: ts thinks it's any[]
    'forward-identity': fwdIdent,
    // @ts-ignore: ts thinks it's any[]
    'reverse-identity': revIdent,
    'value-type': 'ref',
    // @ts-ignore: ts thinks it's type string
    cardinality: 'many',
    'unique?': false,
    'index?': false,
    isUnsynced: true,
    ...(schemaRefProps || {}),
    ...(props || {}),
  };
}

// Actions that have an object, e.g. not delete
const OBJ_ACTIONS = new Set(['create', 'update', 'merge', 'link', 'unlink']);
const REF_ACTIONS = new Set(['link', 'unlink']);
const UPDATE_ACTIONS = new Set(['create', 'update', 'merge']);
const SUPPORTS_LOOKUP_ACTIONS = new Set([
  'link',
  'unlink',
  'create',
  'update',
  'merge',
  'delete',
  'ruleParams',
]);

const lookupProps: Partial<InstantDBAttr> = { 'unique?': true, 'index?': true };
const refLookupProps: Partial<InstantDBAttr> = {
  ...lookupProps,
  cardinality: 'one',
};

function lookupPairsOfOp(op) {
  const res: { etype: string; lookupPair: any; linkLabel?: string }[] = [];
  const [action, etype, eid, obj] = op;
  if (!SUPPORTS_LOOKUP_ACTIONS.has(action)) {
    return res;
  }

  const eidLookupPair = lookupPairOfEid(eid);
  if (eidLookupPair) {
    res.push({ etype: etype, lookupPair: eidLookupPair });
  }
  if (action === 'link') {
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

function createMissingAttrs(
  { attrsStore, schema }: Ctx,
  ops,
): [AttrsStore, TXStep[]] {
  const addedIds = new Set();
  const localAttrs: InstantDBAttr[] = [];
  const addOps: TXStep[] = [];

  function attrByFwdIdent(etype, label): InstantDBAttr | undefined {
    return (
      getAttrByFwdIdentName(attrsStore, etype, label) ||
      localAttrs.find(
        (x) =>
          x['forward-identity'][1] === etype &&
          x['forward-identity'][2] === label,
      )
    );
  }

  function attrByRevIdent(etype, label): InstantDBAttr | undefined {
    return (
      getAttrByReverseIdentName(attrsStore, etype, label) ||
      localAttrs.find(
        (x) =>
          x['reverse-identity']?.[1] === etype &&
          x['reverse-identity']?.[2] === label,
      )
    );
  }

  function addAttr(attr: InstantDBAttr) {
    localAttrs.push(attr);
    addOps.push(['add-attr', attr]);
    addedIds.add(attr.id);
  }
  function addUnsynced(
    attr:
      | (InstantDBAttr & { isUnsynced?: boolean })
      | InstantDBAttr
      | undefined,
  ) {
    if (
      attr &&
      'isUnsynced' in attr &&
      attr.isUnsynced &&
      !addedIds.has(attr.id)
    ) {
      localAttrs.push(attr);
      addOps.push(['add-attr', attr]);
      addedIds.add(attr.id);
    }
  }

  function isRefLookupIdentLocal(etype: string, identName: string) {
    return (
      identName.indexOf('.') !== -1 &&
      // attr names can have `.` in them, so use the attr we find with a `.`
      // before assuming it's a ref lookup.
      !attrByFwdIdent(etype, identName)
    );
  }

  // Adds attrs needed for a ref lookup
  function addForRef(etype, label) {
    const fwdAttr = attrByFwdIdent(etype, label);
    const revAttr = attrByRevIdent(etype, label);
    addUnsynced(fwdAttr);
    addUnsynced(revAttr);
    if (!fwdAttr && !revAttr) {
      addAttr(createRefAttr(schema, etype, label, refLookupProps));
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
        const fwdAttr = attrByFwdIdent(etype, linkLabel);
        const revAttr = attrByRevIdent(etype, linkLabel);
        addUnsynced(fwdAttr);
        addUnsynced(revAttr);
        const linkEtype =
          fwdAttr?.['reverse-identity']?.[1] ||
          revAttr?.['forward-identity']?.[1] ||
          linkLabel;
        if (isRefLookupIdentLocal(linkEtype, identName)) {
          addForRef(linkEtype, extractRefLookupFwdName(identName));
        } else {
          const attr = attrByFwdIdent(linkEtype, identName);
          if (!attr) {
            addAttr(
              createObjectAttr(schema, linkEtype, identName, lookupProps),
            );
          }
          addUnsynced(attr);
        }
      } else if (isRefLookupIdentLocal(etype, identName)) {
        addForRef(etype, extractRefLookupFwdName(identName));
      } else {
        const attr = attrByFwdIdent(etype, identName);
        if (!attr) {
          addAttr(createObjectAttr(schema, etype, identName, lookupProps));
        }
        addUnsynced(attr);
      }
    }
  }

  // Create object and ref attrs
  for (const op of ops) {
    const [action, etype, eid, obj] = op;
    if (OBJ_ACTIONS.has(action)) {
      const idAttr = attrByFwdIdent(etype, 'id');
      addUnsynced(idAttr);
      if (!idAttr) {
        addAttr(createObjectAttr(schema, etype, 'id', { 'unique?': true }));
      }

      for (const label of Object.keys(obj)) {
        const fwdAttr = attrByFwdIdent(etype, label);
        addUnsynced(fwdAttr);
        if (UPDATE_ACTIONS.has(action)) {
          if (!fwdAttr) {
            addAttr(
              createObjectAttr(
                schema,
                etype,
                label,
                label === 'id' ? { 'unique?': true } : null,
              ),
            );
          }
        }
        if (REF_ACTIONS.has(action)) {
          const revAttr = attrByRevIdent(etype, label);
          if (!fwdAttr && !revAttr) {
            addAttr(createRefAttr(schema, etype, label));
          }
          addUnsynced(revAttr);
        }
      }
    }
  }

  if (localAttrs.length) {
    const nextAttrs = { ...attrsStore.attrs };
    for (const attr of localAttrs) {
      nextAttrs[attr.id] = attr;
    }
    return [new AttrsStoreClass(nextAttrs, attrsStore.linkIndex), addOps];
  }
  return [attrsStore, addOps];
}

export function transform(ctx: Ctx, inputChunks) {
  const chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];
  const ops = chunks.flatMap((tx) => getOps(tx));
  const [newAttrs, addAttrTxSteps] = createMissingAttrs(ctx, ops);
  const newCtx = { ...ctx, attrsStore: newAttrs };
  const txSteps = ops.flatMap((op) => toTxSteps(newCtx, op));
  return [...addAttrTxSteps, ...txSteps];
}

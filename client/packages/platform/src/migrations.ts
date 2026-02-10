import {
  DataAttrDef,
  id,
  InstantDBAttr,
  InstantDBAttrOnDelete,
  InstantDBCheckedDataType,
  InstantSchemaDef,
  LinkDef,
} from '@instantdb/core';
import { PlanStep } from './api.ts';
import { attrDefToNewAttrTx, linkDefToNewAttrTx } from './migrationUtils.ts';
import { relationshipConstraints, RelationshipKinds } from './relationships.ts';

export type Identifier = {
  namespace: string;
  attrName: string;
};

type AttrWithIdentifier = {
  'value-type': 'blob' | 'ref';
  cardinality?: 'many' | 'one';
  'forward-identity'?: Identifier;
  'reverse-identity'?: Identifier | null;
  'on-delete'?: InstantDBAttrOnDelete | null | undefined;
  'on-delete-reverse'?: InstantDBAttrOnDelete | null | undefined;
};

export type MigrationTxTypes = {
  'delete-attr': { identifier: Identifier };
  'update-attr': { identifier: Identifier; partialAttr: AttrWithIdentifier };
  'add-attr': {
    identifier: Identifier;
    'unique?': boolean;
    'index?': boolean;
    'required?': boolean;
    'reverse-identity'?: Identifier | null;
    'forward-identity': Identifier;
    cardinality: 'many' | 'one';
    'value-type': 'blob' | 'ref';
    'on-delete'?: InstantDBAttrOnDelete | null;
    'on-delete-reverse'?: InstantDBAttrOnDelete | null;
    'checked-data-type'?: InstantDBCheckedDataType | null;
  };
  index: { identifier: Identifier };
  'remove-index': { identifier: Identifier };
  unique: { identifier: Identifier };
  'remove-unique': { identifier: Identifier };
  required: { identifier: Identifier };
  'remove-required': { identifier: Identifier };
  'check-data-type': {
    identifier: Identifier;
    'checked-data-type': InstantDBCheckedDataType;
  };
  'remove-data-type': { identifier: Identifier };
};

type JobMigrationTypes =
  | 'index'
  | 'remove-index'
  | 'remove-unique'
  | 'remove-required'
  | 'unique'
  | 'remove-data-type'
  | 'required';

type PlanStepMap = {
  [K in PlanStep as K[0]]: K[1];
};

const getExistingAttrThrowing = (
  ident: Identifier,
  existingAttrs: InstantDBAttr[],
): InstantDBAttr => {
  const found =
    existingAttrs.find((attr) => {
      return (
        attr['forward-identity'][1] === ident.namespace &&
        attr['forward-identity'][2] === ident.attrName
      );
    }) || null;
  if (!found) {
    throw new Error(`Attribute ${ident.namespace}.${ident.attrName} not found`);
  }
  return found;
};

const convertSimpleConstraintUpdate: ConvertPlanStepFn<any> = (
  tx,
  existing,
) => {
  const found = getExistingAttrThrowing(tx.identifier, existing);
  return {
    'attr-id': found.id,
    'forward-identity': found['forward-identity'],
  };
};

// converts migration operations from Identifier (namespace/name) based
// into transaction steps that use database ids
const CONVERTERS: AllConvertPlanStepFns = {
  index: convertSimpleConstraintUpdate,
  unique: convertSimpleConstraintUpdate,
  required: convertSimpleConstraintUpdate,
  'remove-index': convertSimpleConstraintUpdate,
  'remove-unique': convertSimpleConstraintUpdate,
  'remove-required': convertSimpleConstraintUpdate,

  'delete-attr': (from, existing) => {
    const found = getExistingAttrThrowing(from.identifier, existing);
    return found.id;
  },
  'update-attr': (from, existing) => {
    const found = getExistingAttrThrowing(from.identifier, existing);
    return {
      id: found.id,
      'forward-identity': from.partialAttr['forward-identity']
        ? [
            found.id,
            from.partialAttr['forward-identity'].namespace,
            from.partialAttr['forward-identity'].attrName,
          ]
        : undefined,
      'reverse-identity': from.partialAttr['reverse-identity']
        ? [
            found.id,
            from.partialAttr['reverse-identity'].namespace,
            from.partialAttr['reverse-identity'].attrName,
          ]
        : undefined,
      cardinality: from.partialAttr['cardinality']
        ? from.partialAttr['cardinality']
        : undefined,

      'on-delete': from.partialAttr['on-delete']
        ? from.partialAttr['on-delete']
        : undefined,
      'on-delete-reverse': from.partialAttr['on-delete-reverse']
        ? from.partialAttr['on-delete-reverse']
        : undefined,
    };
  },
  'add-attr': (from, _existing) => {
    const attrId = id();
    const forwardIdentity: [string, string, string] = [
      attrId,
      from.identifier.namespace,
      from.identifier.attrName,
    ];

    const steps: PlanStep[] = [];

    // First, create the attribute without unique, required, or indexed
    steps.push([
      'add-attr',
      {
        'forward-identity': forwardIdentity,
        'reverse-identity': from['reverse-identity']
          ? [
              id(),
              from['reverse-identity'].namespace,
              from['reverse-identity'].attrName,
            ]
          : null,
        'inferred-types': null,
        'value-type': from['value-type'],
        id: attrId,
        cardinality: from.cardinality,
        'index?': false,
        'required?': false,
        'unique?': false,
        catalog: 'user',
        'on-delete': from['on-delete'],
        'on-delete-reverse': from['on-delete-reverse'],
        'checked-data-type': from['checked-data-type'],
      },
    ]);

    // Then add separate steps for unique, required, and indexed
    if (from['unique?']) {
      steps.push([
        'unique',
        {
          'attr-id': attrId,
          'forward-identity': forwardIdentity,
        },
      ]);
    }

    if (from['required?']) {
      steps.push([
        'required',
        {
          'attr-id': attrId,
          'forward-identity': forwardIdentity,
        },
      ]);
    }

    if (from['index?']) {
      steps.push([
        'index',
        {
          'attr-id': attrId,
          'forward-identity': forwardIdentity,
        },
      ]);
    }

    return steps;
  },
  'remove-data-type': convertSimpleConstraintUpdate,
  'check-data-type': (from, existing) => {
    const found = getExistingAttrThrowing(from.identifier, existing);
    return {
      'attr-id': found.id,
      'checked-data-type': from['checked-data-type'],
      'forward-identity': found['forward-identity'],
    };
  },
};

function isSystemCatalogAttr(
  systemCatalogIdentNames: Record<string, Set<string>>,
  entityName: string,
  attrName: string,
): boolean {
  return !!systemCatalogIdentNames[entityName]?.has(attrName);
}

export const convertTxSteps = (
  txs: MigrationTx[],
  existingAttrs: InstantDBAttr[],
): PlanStep[] => {
  if (!existingAttrs) {
    throw new Error('Existing attributes are required');
  }
  const result: PlanStep[] = [];
  txs.forEach((tx) => {
    const converter = CONVERTERS[tx.type];
    if (!converter) {
      throw new Error(`Unknown transaction type: ${tx.type}`);
    }
    const converted = converter(tx as any, existingAttrs);
    if (Array.isArray(converted)) {
      result.push(...converted);
    } else {
      result.push([tx.type, converted] as PlanStep);
    }
  });
  return result;
};

type ConvertPlanStepFn<T extends keyof MigrationTxTypes> = (
  from: MigrationTxTypes[T],
  existingAttrs: InstantDBAttr[],
) => PlanStepMap[T] | PlanStep[];

type AllConvertPlanStepFns = {
  [K in keyof MigrationTxTypes]: ConvertPlanStepFn<K>;
};

export type MigrationTx = {
  [K in keyof MigrationTxTypes]: {
    type: K;
  } & MigrationTxTypes[K];
}[keyof MigrationTxTypes];

export type MigrationTxSpecific<T extends keyof MigrationTxTypes> = {
  type: T;
} & MigrationTxTypes[T];

export type AnyLink = LinkDef<any, any, any, any, any, any, any>;
export type AnyBlob = DataAttrDef<any, any, any>;

export const diffSchemas = async (
  oldSchema: InstantSchemaDef<any, any, any>,
  newSchema: InstantSchemaDef<any, any, any>,
  resolveFn: RenameResolveFn<string>,
  systemCatalogIdentNames: Record<string, Set<string>>,
): Promise<MigrationTx[]> => {
  const transactions: MigrationTx[] = [];

  const oldEntities = oldSchema.entities;
  const newEntities = newSchema.entities;

  const oldEntityNames = Object.keys(oldEntities);
  const newEntityNames = Object.keys(newEntities);

  const deletedEntityNames = oldEntityNames.filter(
    (name) => !newEntityNames.includes(name),
  );

  for (const entityName of deletedEntityNames) {
    Object.keys(oldEntities[entityName].attrs).forEach((attrName) => {
      if (isSystemCatalogAttr(systemCatalogIdentNames, entityName, attrName))
        return;
      transactions.push({
        type: 'delete-attr',
        identifier: {
          attrName,
          namespace: entityName,
        },
      });
    });
    if (isSystemCatalogAttr(systemCatalogIdentNames, entityName, 'id')) {
      continue;
    }
    transactions.push({
      type: 'delete-attr',
      identifier: {
        attrName: 'id',
        namespace: entityName,
      },
    });
  }

  const addedEntityNames = newEntityNames.filter(
    (name) => !oldEntityNames.includes(name),
  );

  for (const entityName of addedEntityNames) {
    if (!isSystemCatalogAttr(systemCatalogIdentNames, entityName, 'id')) {
      transactions.push({
        type: 'add-attr',
        'forward-identity': {
          namespace: entityName,
          attrName: 'id',
        },
        identifier: {
          attrName: 'id',
          namespace: entityName,
        },
        'index?': false,
        'required?': true,
        cardinality: 'one',
        'unique?': true,
        'value-type': 'blob',
      });
    }

    for (const attrName of Object.keys(newEntities[entityName].attrs)) {
      if (isSystemCatalogAttr(systemCatalogIdentNames, entityName, attrName)) {
        continue;
      }
      const attrInSchema = newEntities[entityName].attrs[attrName];
      transactions.push(attrDefToNewAttrTx(attrInSchema, entityName, attrName));
    }
  }

  const innerEntityNames = oldEntityNames.filter((name) =>
    newEntityNames.includes(name),
  );

  for (const entityName of innerEntityNames) {
    // BLOB ATTRIBUTES
    const addedFields = Object.keys(newEntities[entityName].attrs).filter(
      (field) => {
        if (isSystemCatalogAttr(systemCatalogIdentNames, entityName, field))
          return false;

        const oldEntityHasIt = Object.keys(
          oldEntities[entityName].attrs,
        ).includes(field);
        return !oldEntityHasIt;
      },
    );
    const removedFields = Object.keys(oldEntities[entityName].attrs).filter(
      (field) => {
        if (isSystemCatalogAttr(systemCatalogIdentNames, entityName, field))
          return false;

        const newEntityHasIt = Object.keys(
          newEntities[entityName].attrs,
        ).includes(field);
        return !newEntityHasIt;
      },
    );

    const resolved = await resolveRenames(
      addedFields,
      removedFields,
      resolveFn,
      {
        type: 'attribute',
        entityName: entityName,
      },
    );

    const consistentFields = Object.keys(oldEntities[entityName].attrs).filter(
      (field) => Object.keys(newEntities[entityName].attrs).includes(field),
    );

    consistentFields.forEach((fieldName) => {
      if (isSystemCatalogAttr(systemCatalogIdentNames, entityName, fieldName)) {
        return;
      }
      transactions.push(
        ...compareBlobs(
          {
            attrName: fieldName,
            namespace: entityName,
          },
          oldEntities[entityName].attrs[fieldName],
          newEntities[entityName].attrs[fieldName],
        ),
      );
    });

    resolved.deleted.forEach((attrName) => {
      transactions.push({
        type: 'delete-attr',
        identifier: {
          attrName,
          namespace: entityName,
        },
      });
    });

    resolved.created.forEach((createdName) => {
      const attrInSchema = newSchema.entities[entityName].attrs[
        createdName
      ] as AnyBlob;
      transactions.push(
        attrDefToNewAttrTx(attrInSchema, entityName, createdName),
      );
    });

    resolved.renamed.forEach((renamed) => {
      transactions.push({
        type: 'update-attr',
        identifier: {
          attrName: renamed.from,
          namespace: entityName,
        },
        partialAttr: {
          'value-type': 'blob',
          cardinality: 'one',
          'forward-identity': {
            attrName: renamed.to,
            namespace: entityName,
          },
        },
      });

      transactions.push(
        ...compareBlobs(
          {
            attrName: renamed.from,
            namespace: entityName,
          },
          oldEntities[entityName].attrs[renamed.from],
          newEntities[entityName].attrs[renamed.to],
        ),
      );
    });
  }

  const oldLinks = (Object.values(oldSchema.links) as AnyLink[]).filter(
    (link) =>
      !isSystemCatalogAttr(
        systemCatalogIdentNames,
        link.forward.on,
        link.forward.label,
      ),
  );
  const newLinks = (Object.values(newSchema.links) as AnyLink[]).filter(
    (link) =>
      !isSystemCatalogAttr(
        systemCatalogIdentNames,
        link.forward.on,
        link.forward.label,
      ),
  );

  // Group links by their forward namespace-label combination for comparison
  const createLinkKey = (link: AnyLink) =>
    `${link.forward.on}<->${link.reverse.on}`;
  const createLinkIdentity = (link: AnyLink) =>
    `${link.forward.on}.${link.forward.label}<->${link.reverse.on}.${link.reverse.label}`;

  const newLinksByKey = new Map<string, AnyLink[]>();
  const oldLinksByKey = new Map<string, AnyLink[]>();

  for (const link of newLinks) {
    const key = createLinkKey(link);
    const links = newLinksByKey.get(key) || [];
    links.push(link);
    newLinksByKey.set(key, links);
  }

  for (const link of oldLinks) {
    const key = createLinkKey(link);
    const links = oldLinksByKey.get(key) || [];
    links.push(link);
    oldLinksByKey.set(key, links);
  }

  const allLinkKeys = new Set([
    ...oldLinksByKey.keys(),
    ...newLinksByKey.keys(),
  ]);

  for (const linkKey of allLinkKeys) {
    const oldLinksInGroup = oldLinksByKey.get(linkKey) || [];
    const newLinksInGroup = newLinksByKey.get(linkKey) || [];

    const oldIdentities = oldLinksInGroup.map((link) =>
      createLinkIdentity(link),
    );
    const newIdentities = newLinksInGroup.map((link) =>
      createLinkIdentity(link),
    );

    const addedIdentities = newIdentities.filter(
      (identity) => !oldIdentities.includes(identity),
    );

    const removedIdentities = oldIdentities.filter(
      (identity) => !newIdentities.includes(identity),
    );

    const consistentIdentities = oldIdentities.filter((identity) =>
      newIdentities.includes(identity),
    );

    consistentIdentities.forEach((identity) => {
      const oldLink = oldLinksInGroup.find(
        (l) => createLinkIdentity(l) === identity,
      );
      const newLink = newLinksInGroup.find(
        (l) => createLinkIdentity(l) === identity,
      );
      if (!oldLink || !newLink) return;
      transactions.push(
        ...compareLinks(
          {
            namespace: oldLink.forward.on,
            attrName: oldLink.forward.label,
          },
          oldLink,
          newLink,
        ),
      );
    });

    const resolved = await resolveRenames(
      addedIdentities,
      removedIdentities,
      resolveFn,
      {
        type: 'link',
        forwardEntityName: oldLinksInGroup[0]?.forward.on,
        reverseEntityName: oldLinksInGroup[0]?.reverse.on,
      },
    );

    resolved.deleted.forEach((identity) => {
      const link = oldLinksInGroup.find(
        (l) => createLinkIdentity(l) === identity,
      );
      if (!link) return;
      transactions.push({
        type: 'delete-attr',
        identifier: {
          attrName: link.forward.label,
          namespace: link.forward.on,
        },
      });
    });

    resolved.created.forEach((identity) => {
      const link = newLinksInGroup.find(
        (l) => createLinkIdentity(l) === identity,
      );
      if (!link) return;
      transactions.push(linkDefToNewAttrTx(link));
    });

    resolved.renamed.forEach((renamed) => {
      const oldLink = oldLinksInGroup.find(
        (l) => createLinkIdentity(l) === renamed.from,
      );
      const newLink = newLinksInGroup.find(
        (l) => createLinkIdentity(l) === renamed.to,
      );
      if (!oldLink || !newLink) return;

      transactions.push({
        type: 'update-attr',
        identifier: {
          attrName: oldLink.forward.label,
          namespace: oldLink.forward.on,
        },
        partialAttr: {
          'value-type': 'ref',
          cardinality: newLink.forward.has === 'one' ? 'one' : 'many',
          'forward-identity': {
            attrName: newLink.forward.label,
            namespace: newLink.forward.on,
          },
          'reverse-identity': {
            attrName: newLink.reverse.label,
            namespace: newLink.reverse.on,
          },
        },
      });
      transactions.push(
        ...compareLinks(
          {
            attrName: oldLink.forward.label,
            namespace: oldLink.forward.on,
          },
          oldLink,
          newLink,
        ),
      );
    });
  }

  return transactions;
};

export interface RenamePromptItem<T> {
  from: T;
  to: T;
}

export const compareBlobs = (
  identity: Identifier,
  oldBlob: AnyBlob,
  newBlob: AnyBlob,
): MigrationTx[] => {
  const results: MigrationTx[] = [];
  const sendType = <T extends JobMigrationTypes>(type: T) => {
    results.push({
      type,
      identifier: identity,
    });
  };

  // check if index needs to be added
  if (oldBlob.isIndexed === false && newBlob.isIndexed === true)
    sendType('index');

  // check if index needs to be removed
  if (oldBlob.isIndexed === true && newBlob.isIndexed === false)
    sendType('remove-index');

  // check if needs to become unique
  if (oldBlob.config.unique === false && newBlob.config.unique === true)
    sendType('unique');

  // check if needs to become non-unique
  if (oldBlob.config.unique === true && newBlob.config.unique === false)
    sendType('remove-unique');

  // check if needs to become required
  if (oldBlob.required === false && newBlob.required === true)
    sendType('required');

  // check if needs to become non-required
  if (oldBlob.required === true && newBlob.required === false)
    sendType('remove-required');

  // check if data type needs to be changed / added
  if (oldBlob.valueType !== 'json' && newBlob.valueType === 'json') {
    results.push({
      type: 'remove-data-type',
      identifier: identity,
    });
  } else if (
    oldBlob.valueType !== newBlob.valueType &&
    newBlob.valueType !== 'json'
  ) {
    results.push({
      type: 'check-data-type',
      identifier: identity,
      'checked-data-type': newBlob.valueType,
    });
  }

  return results;
};

export const compareLinks = (
  identity: Identifier,
  oldLink: AnyLink,
  newLink: AnyLink,
): MigrationTx[] => {
  const results: MigrationTx[] = [];
  const oldRelationship =
    `${oldLink.forward.has}-${oldLink.reverse.has}` as RelationshipKinds;
  const { cardinality: oldCardinal, 'unique?': oldUnique } =
    relationshipConstraints[oldRelationship];

  const newRelationship =
    `${newLink.forward.has}-${newLink.reverse.has}` as RelationshipKinds;
  const { cardinality: newCardinal, 'unique?': newUnique } =
    relationshipConstraints[newRelationship];

  if (!oldUnique && newUnique) {
    results.push({
      type: 'unique',
      identifier: identity,
    });
  }
  if (!newUnique && newUnique !== oldUnique) {
    results.push({
      type: 'remove-unique',
      identifier: identity,
    });
  }

  if (
    oldLink.reverse.onDelete !== newLink.reverse.onDelete ||
    oldLink.forward.onDelete !== newLink.forward.onDelete ||
    oldCardinal !== newCardinal
  ) {
    results.push({
      type: 'update-attr',
      identifier: identity,
      partialAttr: {
        'value-type': 'ref',
        'on-delete-reverse': newLink.reverse.onDelete,
        'on-delete': newLink.forward.onDelete,
        cardinality: newCardinal,
      },
    });
  }

  return results;
};

export const isRenamePromptItem = <T>(
  item: RenamePromptItem<T> | T,
): item is RenamePromptItem<T> => {
  if (typeof item === 'object') return true;
  return false;
};

export type RenameResolveFn<T> = (
  created: T,
  promptData: (RenamePromptItem<T> | T)[],
  extraInfo?: any,
) => Promise<T | RenamePromptItem<T>>;

const resolveRenames = async <T>(
  newItems: T[],
  missingItems: T[],
  resolveFn: RenameResolveFn<T>,
  extraInfo?: any,
): Promise<{
  created: T[];
  deleted: T[];
  renamed: {
    from: T;
    to: T;
  }[];
}> => {
  if (missingItems.length === 0 || newItems.length === 0) {
    return {
      created: newItems,
      deleted: missingItems,
      renamed: [],
    };
  }

  const result: {
    created: T[];
    renamed: { from: T; to: T }[];
    deleted: T[];
  } = { created: [], renamed: [], deleted: [] };
  let index = 0;
  let leftMissing = [...missingItems];

  do {
    const created = newItems[index];
    const renames: RenamePromptItem<T>[] = leftMissing.map((it) => {
      return { from: it, to: created };
    });
    const promptData: (RenamePromptItem<T> | T)[] = [created, ...renames];

    const data = await resolveFn(created, promptData, extraInfo);
    if (isRenamePromptItem(data)) {
      if (data.from !== data.to) {
        result.renamed.push(data);
      }
      delete leftMissing[leftMissing.indexOf(data.from)];
      leftMissing = leftMissing.filter(Boolean);
    } else {
      result.created.push(created);
    }
    index += 1;
  } while (index < newItems.length);

  result.deleted.push(...leftMissing);
  return result;
};

/**
 * a `rename command` lets us know your intent to rename a particular entity
 *
 * The format is `from:to`, where `from` and `to` are lookups.
 *
 * For example, to rename `posts.name` to `posts.title`, a command could
 * look like:
 *
 * `posts.name:posts.title`
 */
export type RenameCommand = `${string}.${string}:${string}.${string}`;
function validateRenameLookup(lookup: string) {
  const [etype, label] = lookup.split('.').map((x) => x.trim());
  if (!etype || !label) {
    throw new Error(
      `Invalid look. Got '${lookup}'. We expect a pattern like 'entityname.columname;.` +
        'For example: posts.title',
    );
  }
}

// RenameMap goes from `to` -> `from`
function parseRenameCommands(renames: RenameCommand[]): Map<string, string> {
  // Parse rename options: format is "from:to"
  // note that it saves backwards since we will be testing against the base
  // case of a created attr
  const renameMap: Map<string, string> = new Map();
  for (const renameStr of renames) {
    let [from, to] = renameStr.split(':').map((x) => x.trim());
    validateRenameLookup(from);
    validateRenameLookup(to);
    if (!from || !to) {
      throw new Error(
        `Invalid rename command: ${renameStr}. We could not parse a distinct 'from' and 'to'.` +
          ' The structure should be from:to. For example: posts.name:posts.title',
      );
    }
    renameMap.set(to.trim(), from.trim());
  }
  return renameMap;
}

/**
 * Given a list of RenameCommands, builds a cusotm `resolveFn` for
 * `diffSchemas`, which automatically resolves rename conflicts with these commands.
 */
export function buildAutoRenameSelector(renames: RenameCommand[]) {
  const renameMap = parseRenameCommands(renames);

  const renameFn: RenameResolveFn<string> = async function (
    created: string,
    promptData: (RenamePromptItem<string> | string)[],
    extraInfo: any,
  ): Promise<string | RenamePromptItem<string>> {
    let lookupNames: string[] = [];
    if (extraInfo?.type === 'attribute' && extraInfo?.entityName) {
      lookupNames = [`${extraInfo.entityName}.${created}`];
    } else if (extraInfo?.type === 'link') {
      // Extract both forward and reverse parts
      const parts = created.split('<->');
      lookupNames = [parts[0], parts[1]];
    } else {
      return created;
    }

    // Try to find a match in the rename map using the lookup names
    let fromAttr: string | null = null;
    for (const lookupName of lookupNames) {
      if (renameMap.has(lookupName)) {
        fromAttr = renameMap.get(lookupName) || null;
        break;
      }
    }

    if (fromAttr) {
      let fromValue;
      if (extraInfo?.type === 'attribute') {
        fromValue = fromAttr.split('.').pop();
      } else {
        const matchingItem = promptData.find((item) => {
          const itemStr = typeof item === 'string' ? item : item.from;
          const itemParts = itemStr.split('<->');
          return itemParts[0] === fromAttr || itemParts[1] === fromAttr;
        });

        if (matchingItem) {
          fromValue =
            typeof matchingItem === 'string' ? matchingItem : matchingItem.from;
        } else {
          return created;
        }
      }

      const hasMatch = promptData.some((item) => {
        if (typeof item === 'string') {
          return item === fromValue;
        } else if (item.from) {
          return item.from === fromValue;
        }
        return false;
      });

      if (fromValue && hasMatch) {
        return { from: fromValue, to: created };
      }
    }

    return created;
  };

  return renameFn;
}

import { TransactionChunk, Op, isLookup } from './instatx.ts';
import { IContainEntitiesAndLinks, DataAttrDef } from './schemaTypes.ts';
import { validate as validateUUID } from 'uuid';

export const isValidEntityId = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }
  if (isLookup(value)) {
    return true;
  }
  return validateUUID(value);
};

export class TransactionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionValidationError';
  }
}

const formatAvailableOptions = (items: string[]) =>
  items.length > 0 ? items.join(', ') : 'none';

const createEntityNotFoundError = (
  entityName: string,
  availableEntities: string[],
) =>
  new TransactionValidationError(
    `Entity '${entityName}' does not exist in schema. Available entities: ${formatAvailableOptions(availableEntities)}`,
  );

const TYPE_VALIDATORS = {
  string: (value: unknown) => typeof value === 'string',
  number: (value: unknown) => typeof value === 'number' && !isNaN(value),
  boolean: (value: unknown) => typeof value === 'boolean',
  date: (value: unknown) =>
    value instanceof Date ||
    typeof value === 'string' ||
    typeof value === 'number',
  json: () => true,
} as const;

const isValidValueForAttr = (
  value: unknown,
  attrDef: DataAttrDef<any, any, any>,
): boolean => {
  if (value === null || value === undefined) return true;
  return TYPE_VALIDATORS[attrDef.valueType]?.(value) ?? false;
};

const validateEntityExists = (
  entityName: string,
  schema: IContainEntitiesAndLinks<any, any>,
) => {
  const entityDef = schema.entities[entityName];
  if (!entityDef) {
    throw createEntityNotFoundError(entityName, Object.keys(schema.entities));
  }
  return entityDef;
};

const validateDataOperation = (
  entityName: string,
  data: any,
  schema: IContainEntitiesAndLinks<any, any>,
) => {
  const entityDef = validateEntityExists(entityName, schema);

  if (typeof data !== 'object' || data === null) {
    throw new TransactionValidationError(
      `Arguments for data operation on entity '${entityName}' must be an object, but received: ${typeof data}`,
    );
  }

  for (const [attrName, value] of Object.entries(data)) {
    if (attrName === 'id') continue; // id is handled specially

    const attrDef = entityDef.attrs[attrName];
    if (attrDef) {
      if (!isValidValueForAttr(value, attrDef)) {
        throw new TransactionValidationError(
          `Invalid value for attribute '${attrName}' in entity '${entityName}'. Expected ${attrDef.valueType}, but received: ${typeof value}`,
        );
      }
    }
  }
};

const validateLinkOperation = (
  entityName: string,
  links: any,
  schema: IContainEntitiesAndLinks<any, any>,
) => {
  const entityDef = validateEntityExists(entityName, schema);

  if (typeof links !== 'object' || links === null) {
    throw new TransactionValidationError(
      `Arguments for link operation on entity '${entityName}' must be an object, but received: ${typeof links}`,
    );
  }

  for (const [linkName, linkValue] of Object.entries(links)) {
    const link = entityDef.links[linkName];
    if (!link) {
      const availableLinks = Object.keys(entityDef.links);
      throw new TransactionValidationError(
        `Link '${linkName}' does not exist on entity '${entityName}'. Available links: ${formatAvailableOptions(availableLinks)}`,
      );
    }

    // Validate UUID format for link values
    if (linkValue !== null && linkValue !== undefined) {
      if (Array.isArray(linkValue)) {
        // Handle array of UUIDs
        for (const linkReference of linkValue) {
          if (!isValidEntityId(linkReference)) {
            throw new TransactionValidationError(
              `Invalid entity ID in link '${linkName}' for entity '${entityName}'. Expected a UUID or a lookup, but received: ${linkReference}`,
            );
          }
        }
      } else {
        // Handle single UUID
        if (!isValidEntityId(linkValue)) {
          throw new TransactionValidationError(
            `Invalid UUID in link '${linkName}' for entity '${entityName}'. Expected a UUID, but received: ${linkValue}`,
          );
        }
      }
    }
  }
};

const VALIDATION_STRATEGIES = {
  create: validateDataOperation,
  update: validateDataOperation,
  merge: validateDataOperation,
  link: validateLinkOperation,
  unlink: validateLinkOperation,
  delete: () => {},
} as const;

const validateOp = (
  op: Op,
  schema?: IContainEntitiesAndLinks<any, any>,
): void => {
  if (!schema) return;

  const [action, entityName, _id, args] = op;

  // _id should be a uuid
  if (!Array.isArray(_id)) {
    const isUuid = validateUUID(_id);
    if (!isUuid) {
      throw new TransactionValidationError(
        `Invalid id for entity '${entityName}'. Expected a UUID, but received: ${_id}`,
      );
    }
  }

  if (typeof entityName !== 'string') {
    throw new TransactionValidationError(
      `Entity name must be a string, but received: ${typeof entityName}`,
    );
  }

  const validator =
    VALIDATION_STRATEGIES[action as keyof typeof VALIDATION_STRATEGIES];
  if (validator && args !== undefined) {
    validator(entityName, args, schema);
  }
};

export const validateTransactions = (
  inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  schema?: IContainEntitiesAndLinks<any, any>,
): void => {
  const chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];

  for (const txStep of chunks) {
    if (!txStep || typeof txStep !== 'object') {
      throw new TransactionValidationError(
        `Transaction chunk must be an object, but received: ${typeof txStep}`,
      );
    }

    if (!Array.isArray(txStep.__ops)) {
      throw new TransactionValidationError(
        `Transaction chunk must have __ops array, but received: ${typeof txStep.__ops}`,
      );
    }

    for (const op of txStep.__ops) {
      if (!Array.isArray(op)) {
        throw new TransactionValidationError(
          `Transaction operation must be an array, but received: ${typeof op}`,
        );
      }

      validateOp(op, schema);
    }
  }
};

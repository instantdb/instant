import { TransactionChunk, Op } from './instatx.ts';
import { IContainEntitiesAndLinks, DataAttrDef } from './schemaTypes.ts';

export class TransactionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionValidationError';
  }
}

const isValidValueForAttr = (
  value: unknown,
  attrDef: DataAttrDef<any, any, any>,
): boolean => {
  if (value === null || value === undefined) return true;

  switch (attrDef.valueType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return (
        value instanceof Date ||
        typeof value === 'string' ||
        typeof value === 'number'
      );
    case 'json':
      return true;
    default:
      return attrDef.valueType satisfies never; // proves exaustive switch
  }
};

const validateOpArgs = (
  action: string,
  entityName: string,
  args: any,
  schema?: IContainEntitiesAndLinks<any, any>,
): void => {
  if (!schema) return;

  const entityDef = schema.entities[entityName];
  if (!entityDef) {
    const availableEntities = Object.keys(schema.entities);
    throw new TransactionValidationError(
      `Entity '${entityName}' does not exist in schema. Available entities: ${availableEntities.length > 0 ? availableEntities.join(', ') : 'none'}`,
    );
  }

  if (action === 'create' || action === 'update' || action === 'merge') {
    if (typeof args !== 'object' || args === null) {
      throw new TransactionValidationError(
        `Arguments for ${action} operation on entity '${entityName}' must be an object, but received: ${typeof args}`,
      );
    }

    for (const [attrName, value] of Object.entries(args)) {
      if (attrName === 'id') continue; // id is handled specially

      const attrDef = entityDef.attrs[attrName];
      if (!attrDef) {
        const availableAttrs = Object.keys(entityDef.attrs);
        throw new TransactionValidationError(
          `Attribute '${attrName}' does not exist on entity '${entityName}'. Available attributes: ${availableAttrs.length > 0 ? availableAttrs.join(', ') : 'none'}`,
        );
      }

      // Basic type validation
      if (!isValidValueForAttr(value, attrDef)) {
        throw new TransactionValidationError(
          `Invalid value for attribute '${attrName}' in entity '${entityName}'. Expected ${attrDef.valueType}, but received: ${typeof value}`,
        );
      }
    }
  }

  if (action === 'link' || action === 'unlink') {
    if (typeof args !== 'object' || args === null) {
      throw new TransactionValidationError(
        `Arguments for ${action} operation on entity '${entityName}' must be an object, but received: ${typeof args}`,
      );
    }

    for (const [linkName, linkValue] of Object.entries(args)) {
      const link = entityDef.links[linkName];
      if (!link) {
        const availableLinks = Object.keys(entityDef.links);
        throw new TransactionValidationError(
          `Link '${linkName}' does not exist on entity '${entityName}'. Available links: ${availableLinks.length > 0 ? availableLinks.join(', ') : 'none'}`,
        );
      }
    }
  }
};

const validateOp = (
  op: Op,
  schema?: IContainEntitiesAndLinks<any, any>,
): void => {
  const [action, entityName, _id, args, _opts] = op;

  if (typeof entityName !== 'string') {
    throw new TransactionValidationError(
      `Entity name must be a string, but received: ${typeof entityName}`,
    );
  }

  validateOpArgs(action, entityName, args, schema);
};

export const validateTransactions = (
  inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  schema?: IContainEntitiesAndLinks<any, any>,
): void => {
  let chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];

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

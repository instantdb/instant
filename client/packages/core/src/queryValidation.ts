import { IContainEntitiesAndLinks, DataAttrDef } from './schemaTypes.ts';

class QueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

const dollarSignKeys = [
  'where',
  'order',
  'limit',
  'last',
  'first',
  'offset',
  'after',
  'before',
  'fields',
];

const getAttrType = (attrDef: DataAttrDef<any, any, any>): string => {
  if (attrDef.valueType === 'string') return 'string';
  if (attrDef.valueType === 'number') return 'number';
  if (attrDef.valueType === 'boolean') return 'boolean';
  if (attrDef.valueType === 'date') return 'date';
  if (attrDef.valueType === 'json') return 'object';
  return 'unknown';
};

const isValidValueForType = (
  value: unknown,
  expectedType: string,
  isAnyType: boolean = false,
): boolean => {
  if (isAnyType) return true;
  if (value === null || value === undefined) return true;

  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return value instanceof Date || typeof value === 'string';
    case 'object':
      return typeof value === 'object' && value !== null;
    default:
      return true;
  }
};

const validateWhereClauseValue = (
  value: unknown,
  attrName: string,
  attrDef: DataAttrDef<any, any, any>,
  entityName: string,
): void => {
  const expectedType = getAttrType(attrDef);
  const isAnyType = attrDef.metadata.isAnyType === true;

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    // For any type, allow complex objects without treating them as operators
    if (isAnyType) {
      return; // Any type accepts any value, including complex objects
    }

    const operators = value as Record<string, unknown>;

    for (const [op, opValue] of Object.entries(operators)) {
      switch (op) {
        case 'in':
        case '$in':
          if (!Array.isArray(opValue)) {
            throw new QueryValidationError(
              `Operator '${op}' for attribute '${attrName}' in entity '${entityName}' must be an array, but received: ${typeof opValue}`,
            );
          }
          for (const item of opValue) {
            if (!isValidValueForType(item, expectedType, isAnyType)) {
              throw new QueryValidationError(
                `Invalid value in '${op}' array for attribute '${attrName}' in entity '${entityName}'. Expected ${expectedType}, but received: ${typeof item}`,
              );
            }
          }
          break;
        case '$not':
        case '$gt':
        case '$lt':
        case '$gte':
        case '$lte':
          if (!isValidValueForType(opValue, expectedType, isAnyType)) {
            throw new QueryValidationError(
              `Invalid value for operator '${op}' on attribute '${attrName}' in entity '${entityName}'. Expected ${expectedType}, but received: ${typeof opValue}`,
            );
          }
          break;
        case '$like':
        case '$ilike':
          if (expectedType !== 'string' && !isAnyType) {
            throw new QueryValidationError(
              `Operator '${op}' can only be used with string attributes, but '${attrName}' in entity '${entityName}' is of type ${expectedType}`,
            );
          }
          if (typeof opValue !== 'string') {
            throw new QueryValidationError(
              `Operator '${op}' for attribute '${attrName}' in entity '${entityName}' must be a string, but received: ${typeof opValue}`,
            );
          }
          break;
        case '$isNull':
          if (typeof opValue !== 'boolean') {
            throw new QueryValidationError(
              `Operator '$isNull' for attribute '${attrName}' in entity '${entityName}' must be a boolean, but received: ${typeof opValue}`,
            );
          }
          if (attrDef.required && opValue === true) {
            throw new QueryValidationError(
              `Cannot use '$isNull: true' on required attribute '${attrName}' in entity '${entityName}'`,
            );
          }
          break;
        default:
          throw new QueryValidationError(
            `Unknown operator '${op}' for attribute '${attrName}' in entity '${entityName}'`,
          );
      }
    }
  } else {
    if (!isValidValueForType(value, expectedType, isAnyType)) {
      throw new QueryValidationError(
        `Invalid value for attribute '${attrName}' in entity '${entityName}'. Expected ${expectedType}, but received: ${typeof value}`,
      );
    }
  }
};

const validateWhereClause = (
  whereClause: Record<string, unknown>,
  entityName: string,
  schema: IContainEntitiesAndLinks<any, any>,
): void => {
  for (const [key, value] of Object.entries(whereClause)) {
    if (key === 'or' || key === 'and') {
      if (Array.isArray(value)) {
        for (const clause of value) {
          if (typeof clause === 'object' && clause !== null) {
            validateWhereClause(
              clause as Record<string, unknown>,
              entityName,
              schema,
            );
          }
        }
      }
      continue;
    }

    if (key === 'id') {
      validateWhereClauseValue(
        value,
        'id',
        new DataAttrDef('string', false, true),
        entityName,
      );
      continue;
    }

    if (key.includes('.')) {
      continue;
    }

    const entityDef = schema.entities[entityName];
    if (!entityDef) continue;

    const attrDef = entityDef.attrs[key];
    if (!attrDef) {
      const availableAttrs = Object.keys(entityDef.attrs);
      throw new QueryValidationError(
        `Attribute '${key}' does not exist on entity '${entityName}'. Available attributes: ${availableAttrs.length > 0 ? availableAttrs.join(', ') : 'none'}`,
      );
    }

    validateWhereClauseValue(value, key, attrDef, entityName);
  }
};

const validateDollarObject = (
  dollarObj: Record<string, unknown>,
  entityName: string,
  schema?: IContainEntitiesAndLinks<any, any>,
): void => {
  for (const key of Object.keys(dollarObj)) {
    if (!dollarSignKeys.includes(key)) {
      throw new QueryValidationError(
        `Invalid query parameter '${key}' in $ object. Valid parameters are: ${dollarSignKeys.join(', ')}. Found: ${key}`,
      );
    }
  }

  if (dollarObj.where && schema) {
    if (typeof dollarObj.where !== 'object' || dollarObj.where === null) {
      throw new QueryValidationError(
        `'where' clause must be an object in entity '${entityName}', but received: ${typeof dollarObj.where}`,
      );
    }
    validateWhereClause(
      dollarObj.where as Record<string, unknown>,
      entityName,
      schema,
    );
  }
};

const validateEntityInQuery = (
  queryPart: Record<string, unknown>,
  entityName: string,
  schema: IContainEntitiesAndLinks<any, any>,
): void => {
  if (!queryPart || typeof queryPart !== 'object') {
    throw new QueryValidationError(
      `Query part for entity '${entityName}' must be an object, but received: ${typeof queryPart}`,
    );
  }

  for (const key of Object.keys(queryPart)) {
    if (key !== '$') {
      // Validate link exists
      if (schema && !(key in schema.entities[entityName].links)) {
        const availableLinks = Object.keys(schema.entities[entityName].links);
        throw new QueryValidationError(
          `Link '${key}' does not exist on entity '${entityName}'. Available links: ${availableLinks.length > 0 ? availableLinks.join(', ') : 'none'}`,
        );
      }

      // Recursively validate nested query
      const nestedQuery = queryPart[key];
      if (typeof nestedQuery === 'object' && nestedQuery !== null) {
        const linkedEntityName =
          schema?.entities[entityName].links[key]?.entityName;
        if (linkedEntityName) {
          validateEntityInQuery(
            nestedQuery as Record<string, unknown>,
            linkedEntityName,
            schema,
          );
        }
      }
    } else {
      // Validate $ object
      const dollarObj = queryPart[key];
      if (typeof dollarObj !== 'object' || dollarObj === null) {
        throw new QueryValidationError(
          `Query parameter '$' must be an object in entity '${entityName}', but received: ${typeof dollarObj}`,
        );
      }

      validateDollarObject(
        dollarObj as Record<string, unknown>,
        entityName,
        schema,
      );
    }
  }
};

export const validateQuery = (
  q: unknown,
  schema?: IContainEntitiesAndLinks<any, any>,
): void => {
  if (typeof q !== 'object' || q === null) {
    throw new QueryValidationError(
      `Query must be an object, but received: ${typeof q}${q === null ? ' (null)' : ''}`,
    );
  }

  const queryObj = q as Record<string, unknown>;

  for (const topLevelKey of Object.keys(queryObj)) {
    if (typeof topLevelKey !== 'string') {
      throw new QueryValidationError(
        `Query keys must be strings, but found key of type: ${typeof topLevelKey}`,
      );
    }

    // Check if the key is top level entity
    if (schema) {
      if (!schema.entities[topLevelKey]) {
        const availableEntities = Object.keys(schema.entities);
        throw new QueryValidationError(
          `Entity '${topLevelKey}' does not exist in schema. Available entities: ${availableEntities.length > 0 ? availableEntities.join(', ') : 'none'}`,
        );
      }
    }

    validateEntityInQuery(
      queryObj[topLevelKey] as Record<string, unknown>,
      topLevelKey,
      schema,
    );
  }
};

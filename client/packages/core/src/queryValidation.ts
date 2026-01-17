import {
  IContainEntitiesAndLinks,
  DataAttrDef,
  ValueTypes,
} from './schemaTypes.ts';
import { validate as validateUUID } from 'uuid';

export class QueryValidationError extends Error {
  constructor(message: string, path?: string) {
    const fullMessage = path ? `At path '${path}': ${message}` : message;
    super(fullMessage);
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
  'aggregate',
];

type PossibleAttrTypes = ValueTypes | 'unknown';

const getAttrType = (
  attrDef: DataAttrDef<any, any, any>,
): PossibleAttrTypes => {
  return attrDef.valueType || 'unknown';
};

const isValidValueForType = (
  value: unknown,
  expectedType: PossibleAttrTypes,
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
      return (
        value instanceof Date ||
        typeof value === 'string' ||
        typeof value === 'number'
      );
    default:
      return true;
  }
};

const validateOperator = (
  op: string,
  opValue: unknown,
  expectedType: PossibleAttrTypes,
  attrName: string,
  entityName: string,
  attrDef: DataAttrDef<any, any, any>,
  path: string,
) => {
  const isAnyType = attrDef.valueType === 'json';
  const assertValidValue = (
    op: string,
    expectedType: PossibleAttrTypes,
    opValue: unknown,
  ) => {
    if (!isValidValueForType(opValue, expectedType, isAnyType)) {
      throw new QueryValidationError(
        `Invalid value for operator '${op}' on attribute '${attrName}' in entity '${entityName}'. Expected ${expectedType}, but received: ${typeof opValue}`,
        path,
      );
    }
  };

  switch (op) {
    case 'in':
    case '$in':
      if (!Array.isArray(opValue)) {
        throw new QueryValidationError(
          `Operator '${op}' for attribute '${attrName}' in entity '${entityName}' must be an array, but received: ${typeof opValue}`,
          path,
        );
      }
      for (const item of opValue) {
        assertValidValue(op, expectedType, item);
      }
      break;
    case '$not':
    case '$ne':
    case '$gt':
    case '$lt':
    case '$gte':
    case '$lte':
      assertValidValue(op, expectedType, opValue);
      break;
    case '$like':
    case '$ilike':
      assertValidValue(op, 'string', opValue);

      if (op === '$ilike') {
        if (!attrDef.isIndexed) {
          throw new QueryValidationError(
            `Operator '${op}' can only be used with indexed attributes, but '${attrName}' in entity '${entityName}' is not indexed`,
            path,
          );
        }
      }

      break;
    case '$isNull':
      assertValidValue(op, 'boolean', opValue);
      break;
    default:
      throw new QueryValidationError(
        `Unknown operator '${op}' for attribute '${attrName}' in entity '${entityName}'`,
        path,
      );
  }
};

const validateWhereClauseValue = (
  value: unknown,
  attrName: string,
  attrDef: DataAttrDef<any, any, any>,
  entityName: string,
  path: string,
): void => {
  const expectedType = getAttrType(attrDef);
  const isAnyType = attrDef.valueType === 'json';

  const isComplexObject =
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (isComplexObject) {
    // For any type, allow complex objects without treating them as operators
    if (isAnyType) {
      return; // Any type accepts any value, including complex objects
    }

    const operators = value as Record<string, unknown>;

    for (const [op, opValue] of Object.entries(operators)) {
      validateOperator(
        op,
        opValue,
        expectedType,
        attrName,
        entityName,
        attrDef,
        `${path}.${op}`,
      );
    }
  } else {
    if (!isValidValueForType(value, expectedType, isAnyType)) {
      throw new QueryValidationError(
        `Invalid value for attribute '${attrName}' in entity '${entityName}'. Expected ${expectedType}, but received: ${typeof value}`,
        path,
      );
    }
  }
};

const validateDotNotationAttribute = (
  dotPath: string,
  value: unknown,
  startEntityName: string,
  schema: IContainEntitiesAndLinks<any, any>,
  path: string,
): void => {
  const pathParts = dotPath.split('.');
  if (pathParts.length < 2) {
    throw new QueryValidationError(
      `Invalid dot notation path '${dotPath}'. Must contain at least one dot.`,
      path,
    );
  }

  let currentEntityName = startEntityName;

  // Traverse all path parts except the last one (which should be an attribute)
  for (let i = 0; i < pathParts.length - 1; i++) {
    const linkName = pathParts[i];
    const currentEntity = schema.entities[currentEntityName];

    if (!currentEntity) {
      throw new QueryValidationError(
        `Entity '${currentEntityName}' does not exist in schema while traversing dot notation path '${dotPath}'.`,
        path,
      );
    }

    const link = currentEntity.links[linkName];
    if (!link) {
      const availableLinks = Object.keys(currentEntity.links);
      throw new QueryValidationError(
        `Link '${linkName}' does not exist on entity '${currentEntityName}' in dot notation path '${dotPath}'. Available links: ${availableLinks.length > 0 ? availableLinks.join(', ') : 'none'}`,
        path,
      );
    }

    currentEntityName = link.entityName;
  }

  // Validate the final attribute
  const finalAttrName = pathParts[pathParts.length - 1];
  const finalEntity = schema.entities[currentEntityName];

  if (!finalEntity) {
    throw new QueryValidationError(
      `Target entity '${currentEntityName}' does not exist in schema for dot notation path '${dotPath}'.`,
      path,
    );
  }

  // Handle 'id' field specially - every entity has an id field
  if (finalAttrName === 'id') {
    if (typeof value == 'string' && !validateUUID(value)) {
      throw new QueryValidationError(
        `Invalid value for id field in entity '${currentEntityName}'. Expected a UUID, but received: ${value}`,
        path,
      );
    }
    validateWhereClauseValue(
      value,
      dotPath,
      new DataAttrDef('string', false, true),
      startEntityName,
      path,
    );
    return;
  }

  const attrDef = finalEntity.attrs[finalAttrName];

  if (Object.keys(finalEntity.links).includes(finalAttrName)) {
    if (typeof value === 'string' && !validateUUID(value)) {
      throw new QueryValidationError(
        `Invalid value for link '${finalAttrName}' in entity '${currentEntityName}'. Expected a UUID, but received: ${value}`,
        path,
      );
    }

    validateWhereClauseValue(
      value,
      dotPath,
      new DataAttrDef('string', false, true),
      startEntityName,
      path,
    );
    return;
  }

  if (!attrDef) {
    const availableAttrs = Object.keys(finalEntity.attrs);
    throw new QueryValidationError(
      `Attribute '${finalAttrName}' does not exist on entity '${currentEntityName}' in dot notation path '${dotPath}'. Available attributes: ${availableAttrs.length > 0 ? availableAttrs.join(', ') + ', id' : 'id'}`,
      path,
    );
  }

  // Validate the value against the attribute type
  validateWhereClauseValue(value, dotPath, attrDef, startEntityName, path);
};

const validateWhereClause = (
  whereClause: Record<string, unknown>,
  entityName: string,
  schema: IContainEntitiesAndLinks<any, any>,
  path: string,
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
              `${path}.${key}[${clause}]`,
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
        `${path}.id`,
      );
      continue;
    }

    if (key.includes('.')) {
      validateDotNotationAttribute(
        key,
        value,
        entityName,
        schema,
        `${path}.${key}`,
      );
      continue;
    }

    const entityDef = schema.entities[entityName];
    if (!entityDef) continue;

    const attrDef = entityDef.attrs[key];
    const linkDef = entityDef.links[key];

    if (!attrDef && !linkDef) {
      const availableAttrs = Object.keys(entityDef.attrs);
      const availableLinks = Object.keys(entityDef.links);
      throw new QueryValidationError(
        `Attribute or link '${key}' does not exist on entity '${entityName}'. Available attributes: ${availableAttrs.length > 0 ? availableAttrs.join(', ') : 'none'}. Available links: ${availableLinks.length > 0 ? availableLinks.join(', ') : 'none'}`,
        `${path}.${key}`,
      );
    }

    if (attrDef) {
      validateWhereClauseValue(
        value,
        key,
        attrDef,
        entityName,
        `${path}.${key}`,
      );
    } else if (linkDef) {
      // For links, we expect the value to be a string (ID of the linked entity)
      // Create a synthetic string attribute definition for validation
      if (typeof value === 'string' && !validateUUID(value)) {
        throw new QueryValidationError(
          `Invalid value for link '${key}' in entity '${entityName}'. Expected a UUID, but received: ${value}`,
          `${path}.${key}`,
        );
      }
      const syntheticAttrDef = new DataAttrDef('string', false, true);
      validateWhereClauseValue(
        value,
        key,
        syntheticAttrDef,
        entityName,
        `${path}.${key}`,
      );
    }
  }
};

const validateDollarObject = (
  dollarObj: Record<string, unknown>,
  entityName: string,
  schema?: IContainEntitiesAndLinks<any, any> | null | undefined,
  path?: string,
  depth: number = 0,
): void => {
  for (const key of Object.keys(dollarObj)) {
    if (!dollarSignKeys.includes(key)) {
      throw new QueryValidationError(
        `Invalid query parameter '${key}' in $ object. Valid parameters are: ${dollarSignKeys.join(', ')}. Found: ${key}`,
        path,
      );
    }
  }

  // Validate that pagination parameters are only used at top-level
  const paginationParams = [
    // 'limit', // only supported client side
    'offset',
    'before',
    'after',
    'first',
    'last',
  ];
  for (const param of paginationParams) {
    if (dollarObj[param] !== undefined && depth > 0) {
      throw new QueryValidationError(
        `'${param}' can only be used on top-level namespaces. It cannot be used in nested queries.`,
        path,
      );
    }
  }

  if (dollarObj.where && schema) {
    if (typeof dollarObj.where !== 'object' || dollarObj.where === null) {
      throw new QueryValidationError(
        `'where' clause must be an object in entity '${entityName}', but received: ${typeof dollarObj.where}`,
        path ? `${path}.where` : undefined,
      );
    }
    validateWhereClause(
      dollarObj.where as Record<string, unknown>,
      entityName,
      schema,
      path ? `${path}.where` : 'where',
    );
  }
};

const validateEntityInQuery = (
  queryPart: Record<string, unknown>,
  entityName: string,
  schema: IContainEntitiesAndLinks<any, any> | null | undefined,
  path: string,
  depth: number = 0,
): void => {
  if (!queryPart || typeof queryPart !== 'object') {
    throw new QueryValidationError(
      `Query part for entity '${entityName}' must be an object, but received: ${typeof queryPart}`,
      path,
    );
  }

  for (const key of Object.keys(queryPart)) {
    if (key !== '$') {
      // Validate link exists
      if (schema && !(key in schema.entities[entityName].links)) {
        const availableLinks = Object.keys(schema.entities[entityName].links);
        throw new QueryValidationError(
          `Link '${key}' does not exist on entity '${entityName}'. Available links: ${availableLinks.length > 0 ? availableLinks.join(', ') : 'none'}`,
          `${path}.${key}`,
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
            `${path}.${key}`,
            depth + 1,
          );
        }
      }
    } else {
      // Validate $ object
      const dollarObj = queryPart[key];
      if (typeof dollarObj !== 'object' || dollarObj === null) {
        throw new QueryValidationError(
          `Query parameter '$' must be an object in entity '${entityName}', but received: ${typeof dollarObj}`,
          `${path}.$`,
        );
      }

      validateDollarObject(
        dollarObj as Record<string, unknown>,
        entityName,
        schema,
        `${path}.$`,
        depth,
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

  if (Array.isArray(q)) {
    throw new QueryValidationError(
      `Query must be an object, but received: ${typeof q}`,
    );
  }

  const queryObj = q as Record<string, unknown>;

  for (const topLevelKey of Object.keys(queryObj)) {
    if (Array.isArray(q[topLevelKey])) {
      throw new QueryValidationError(
        `Query keys must be strings, but found key of type: ${typeof topLevelKey}`,
        topLevelKey,
      );
    }

    if (typeof topLevelKey !== 'string') {
      throw new QueryValidationError(
        `Query keys must be strings, but found key of type: ${typeof topLevelKey}`,
        topLevelKey,
      );
    }

    if (topLevelKey === '$$ruleParams') {
      continue;
    }

    // Check if the key is top level entity
    if (schema) {
      if (!schema.entities[topLevelKey]) {
        const availableEntities = Object.keys(schema.entities);
        throw new QueryValidationError(
          `Entity '${topLevelKey}' does not exist in schema. Available entities: ${availableEntities.length > 0 ? availableEntities.join(', ') : 'none'}`,
          topLevelKey,
        );
      }
    }

    validateEntityInQuery(
      queryObj[topLevelKey] as Record<string, unknown>,
      topLevelKey,
      schema,
      topLevelKey,
      0, // Start at depth 0 for top-level entities
    );
  }
};

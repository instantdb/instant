import { IContainEntitiesAndLinks } from './schemaTypes.ts';

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

const validateDollarObject = (dollarObj: Record<string, unknown>): void => {
  for (const key of Object.keys(dollarObj)) {
    if (!dollarSignKeys.includes(key)) {
      throw new QueryValidationError(
        `Invalid query parameter '${key}' in $ object. Valid parameters are: ${dollarSignKeys.join(', ')}. Found: ${key}`,
      );
    }
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

      validateDollarObject(dollarObj as Record<string, unknown>);
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

import { IContainEntitiesAndLinks } from './schemaTypes.ts';

type QueryValidationResult =
  | {
      status: 'success';
    }
  | {
      status: 'error';
      message: string;
    };

const error = (message: string) =>
  ({
    message,
    status: 'error',
  }) satisfies QueryValidationResult;

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

const validateDollarObject = (
  dollarObj: Record<string, unknown>,
): QueryValidationResult => {
  for (const key of Object.keys(dollarObj)) {
    if (!dollarSignKeys.includes(key)) {
      return error(
        `Invalid $ key: ${key}. Valid keys are: ${dollarSignKeys.join(', ')}`,
      );
    }
  }

  return {
    status: 'success',
  };
};

const validateEntityInQuery = (
  queryPart: Record<string, unknown>,
  entityName: string,
  schema: IContainEntitiesAndLinks<any, any>,
): QueryValidationResult => {
  if (!queryPart || typeof queryPart !== 'object') {
    return error('Query part must be an object');
  }

  for (const key of Object.keys(queryPart)) {
    if (key !== '$') {
      // Validate link exists
      if (schema && !(key in schema.entities[entityName].links)) {
        return error(`Link ${key} does not exist on entity ${entityName}`);
      }

      // Recursively validate nested query
      const nestedQuery = queryPart[key];
      if (typeof nestedQuery === 'object' && nestedQuery !== null) {
        const linkedEntityName =
          schema?.entities[entityName].links[key]?.entityName;
        if (linkedEntityName) {
          const nestedResult = validateEntityInQuery(
            nestedQuery as Record<string, unknown>,
            linkedEntityName,
            schema,
          );
          if (nestedResult.status !== 'success') {
            return nestedResult;
          }
        }
      }
    } else {
      // Validate $ object
      const dollarObj = queryPart[key];
      if (typeof dollarObj !== 'object' || dollarObj === null) {
        return error('$ must be an object');
      }

      const dollarResult = validateDollarObject(
        dollarObj as Record<string, unknown>,
      );
      if (dollarResult.status !== 'success') {
        return dollarResult;
      }
    }
  }

  return {
    status: 'success',
  };
};

export const validateQuery = (
  q: unknown,
  schema?: IContainEntitiesAndLinks<any, any>,
): QueryValidationResult => {
  if (typeof q !== 'object' || q === null) {
    return error('Query must be an object');
  }

  const queryObj = q as Record<string, unknown>;

  for (const topLevelKey of Object.keys(queryObj)) {
    if (typeof topLevelKey !== 'string') {
      return error('Query keys must be strings');
    }

    // Check if the key is top level entity
    if (schema) {
      if (!schema.entities[topLevelKey]) {
        return error(`Entity ${topLevelKey} does not exist`);
      }
    }

    const innerResult = validateEntityInQuery(
      queryObj[topLevelKey] as Record<string, unknown>,
      topLevelKey,
      schema,
    );
    if (innerResult.status !== 'success') {
      return innerResult;
    }
  }

  return {
    status: 'success',
  };
};

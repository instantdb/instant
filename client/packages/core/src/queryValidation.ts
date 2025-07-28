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

const validateEntityInQuery = (
  queryPart: Record<string, unknown>,
  entityName: string,
  schema: IContainEntitiesAndLinks<any, any>,
): QueryValidationResult => {
  for (const key of Object.keys(queryPart)) {
    if (key !== '$') {
      if (key in schema.entities[entityName].links) {
      } else {
        return error(`Link ${key} does not exist`);
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
  console.log('Testing query', q);

  if (typeof q !== 'object') {
    return error('Query must be an object');
  }

  for (const topLevelKey of Object.keys(q)) {
    if (typeof topLevelKey !== 'string') {
      return error('Query must be a string');
    }

    // Check if the key is top level entity
    if (schema) {
      if (!schema.entities[topLevelKey]) {
        return error(`Entity ${topLevelKey} does not exist`);
      }
    }

    const innerResult = validateEntityInQuery(
      q[topLevelKey],
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

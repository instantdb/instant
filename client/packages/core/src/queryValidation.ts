import { InstantUnknownSchema } from './schemaTypes.ts';

type QueryValidationError = {
  message: string;
};

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

export const validateQuery = (
  q: unknown,
  schema: InstantUnknownSchema,
): QueryValidationResult => {
  console.log('Testing query', q);

  if (typeof q !== 'object') {
    return {
      status: 'error',
      message: 'Query must be an object',
    };
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
  }

  return {
    status: 'success',
  };
};

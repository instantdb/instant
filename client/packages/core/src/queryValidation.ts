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
      errors: QueryValidationError[];
    };

export const validateQuery = (
  q: unknown,
  schema: InstantUnknownSchema,
): QueryValidationResult => {
  const errors: QueryValidationError[] = [];

  if (typeof q !== 'object') {
    return {
      status: 'error',
      errors: [
        {
          message: 'Query must be an object',
        },
      ],
    };
  }

  for (const topLevelKey in Object.keys(q)) {
    if (typeof q[topLevelKey] !== 'string') {
      errors.push({
        message: `Query key must be a string`,
      });
    }
  }

  return {
    status: 'success',
  };
};

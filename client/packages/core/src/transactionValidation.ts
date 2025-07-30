import { TransactionChunk } from './instatx.ts';
import { IContainEntitiesAndLinks } from './schemaTypes.ts';

export class TransactionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

export const validateTransaction = (
  inputChunks: TransactionChunk<any, any> | TransactionChunk<any, any>[],
  schema?: IContainEntitiesAndLinks<any, any>,
): void => {
  let chunks = Array.isArray(inputChunks) ? inputChunks : [inputChunks];
  for (const txStep of chunks) {
  }
};

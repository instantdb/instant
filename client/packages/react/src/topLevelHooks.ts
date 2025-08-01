import { useContext } from 'react';
import { InstantReactWebDatabase, InstaQLParams } from './index.ts';
import { InstaQLLifecycleState, InstaQLOptions } from '@instantdb/core';
import { InstantContext, RegisteredSchema } from './InstantProvider.tsx';

export const useDb = (): InstantReactWebDatabase<RegisteredSchema> => {
  const context = useContext(InstantContext);
  if (!context) {
    throw new Error('useDb must be used within InstantProvider');
  }
  return context.db;
};

export const useQuery = <Q extends InstaQLParams<RegisteredSchema>>(
  query: Q,
  options?: InstaQLOptions,
): InstaQLLifecycleState<RegisteredSchema, Q> => {
  const db = useDb();
  return db.useQuery(query, options) as InstaQLLifecycleState<
    RegisteredSchema,
    Q
  >;
};

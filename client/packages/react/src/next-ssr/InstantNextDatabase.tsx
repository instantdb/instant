import {
  AuthState,
  InstantSchemaDef,
  InstaQLResponse,
  PageInfoResponse,
  RuleParams,
  ValidQuery,
} from '@instantdb/core';
import InstantReactWebDatabase from '../InstantReactWebDatabase.ts';
import { useContext } from 'react';
import { SuspsenseQueryContext } from './InstantSuspenseProvider.tsx';

export class InstantNextDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  UseDates extends boolean,
> extends InstantReactWebDatabase<Schema, UseDates> {
  public useSuspenseQuery = <Q extends ValidQuery<Q, Schema>>(
    q: Q,
    opts?: {
      ruleParams: RuleParams;
    },
  ): {
    data: InstaQLResponse<Schema, Q, NonNullable<UseDates>>;
    pageInfo?: PageInfoResponse<Q>;
  } => {
    const ctx = useContext(SuspsenseQueryContext);
    if (!ctx) {
      throw new Error(
        'useSuspenseQuery must be used within a SuspenseQueryProvider',
      );
    }
    return ctx.useSuspenseQuery(q, opts) as any;
  };

  useAuth = (): AuthState => {
    const ctx = useContext(SuspsenseQueryContext);
    const realAuthResult = this._useAuth();
    if (!ctx) {
      return realAuthResult;
    }

    const { ssrUser } = ctx;
    if (ssrUser === undefined) {
      return realAuthResult;
    }
    if (realAuthResult.isLoading) {
      return {
        error: undefined,
        isLoading: false,
        user: ssrUser ?? undefined, // null -> undefined for the response
      };
    }

    return realAuthResult;
  };
}

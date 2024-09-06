import { InstaQLQueryParams, InstaQLQueryResult, Remove$ } from "./queryTypes";
import { InstantGraph } from "./schema";
import { IDatabase } from "./coreTypes";

export type InstantQuery<_DB extends IDatabase<any, any, any>> =
  _DB extends IDatabase<infer Schema, any, any>
    ? Schema extends InstantGraph<any, any, any>
      ? InstaQLQueryParams<Schema>
      : never
    : never;

export type InstantQueryResult<_DB extends IDatabase<any, any, any>, Q> =
  _DB extends IDatabase<infer Schema, any, infer CardinalityInference>
    ? Schema extends InstantGraph<infer E, any>
      ? InstaQLQueryResult<E, Remove$<Q>, CardinalityInference>
      : never
    : never;

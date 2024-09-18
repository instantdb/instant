import type {
  InstaQLQueryParams,
  InstaQLQueryResult,
  Remove$,
} from "./queryTypes";
import type { InstantGraph } from "./schemaTypes";
import type { IDatabase } from "./coreTypes";

export type InstantQuery<DB extends IDatabase<any, any, any>> =
  DB extends IDatabase<infer Schema, any, any>
    ? Schema extends InstantGraph<any, any, any>
      ? InstaQLQueryParams<Schema>
      : never
    : never;

export type InstantQueryResult<DB extends IDatabase<any, any, any>, Q> =
  DB extends IDatabase<infer Schema, any, infer CardinalityInference>
    ? Schema extends InstantGraph<infer E, any>
      ? InstaQLQueryResult<E, Remove$<Q>, CardinalityInference>
      : never
    : never;

export type InstantSchema<DB extends IDatabase<any, any, any>> =
  DB extends IDatabase<infer Schema, any, any> ? Schema : never;

import type {
  InstaQLQueryEntityResult,
  InstaQLQueryParams,
  InstaQLQueryResult,
  Remove$,
} from "./queryTypes";
import type { InstantGraph } from "./schemaTypes";
import type { IDatabase } from "./coreTypes";
import { RoomSchemaShape } from "./presence";

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

export type InstantEntity<
  DB extends IDatabase<any, any, any>,
  EntityName extends DB extends IDatabase<infer Schema, any, any>
    ? Schema extends InstantGraph<infer Entities, any>
      ? keyof Entities
      : never
    : never,
  Query extends
    | (DB extends IDatabase<infer Schema, any, any>
        ? Schema extends InstantGraph<infer Entities, any>
          ? {
              [QueryPropName in keyof Entities[EntityName]["links"]]?: any;
            }
          : never
        : never)
    | {} = {},
> =
  DB extends IDatabase<infer Schema, any, any>
    ? Schema extends InstantGraph<infer Entities, any>
      ? EntityName extends keyof Entities
        ? InstaQLQueryEntityResult<Entities, EntityName, Query, true>
        : never
      : never
    : never;

export type InstantSchemaDatabase<
  Schema extends InstantGraph<any, any>,
  R extends RoomSchemaShape = {},
  CI extends boolean = true,
> = IDatabase<Schema, R, CI>;

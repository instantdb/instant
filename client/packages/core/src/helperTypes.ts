import type {
  InstaQLQueryEntityResult,
  InstaQLQueryParams,
  InstaQLQueryResult,
  Remove$,
} from "./queryTypes";
import type { InstantGraph } from "./schemaTypes";
import type { IDatabase, IDatabaseExperimental } from "./coreTypes";
import { RoomSchemaShape } from "./presence";

export type InstantQuery<DB extends IDatabaseExperimental<any, any, any>> =
  DB extends IDatabaseExperimental<infer Schema, any, any>
    ? Schema extends InstantGraph<any, any, any>
      ? InstaQLQueryParams<Schema>
      : never
    : never;

export type InstantQueryResult<
  DB extends IDatabaseExperimental<any, any, any>,
  Q,
> =
  DB extends IDatabaseExperimental<
    infer Schema,
    any,
    infer CardinalityInference
  >
    ? Schema extends InstantGraph<infer E, any>
      ? InstaQLQueryResult<E, Remove$<Q>, CardinalityInference>
      : never
    : never;

export type InstantSchema<DB extends IDatabaseExperimental<any, any, any>> =
  DB extends IDatabaseExperimental<infer Schema, any, any> ? Schema : never;

export type InstantEntity<
  DB extends IDatabaseExperimental<any, any, any>,
  EntityName extends DB extends IDatabaseExperimental<infer Schema, any, any>
    ? Schema extends InstantGraph<infer Entities, any>
      ? keyof Entities
      : never
    : never,
  Query extends
    | (DB extends IDatabaseExperimental<infer Schema, any, any>
        ? Schema extends InstantGraph<infer Entities, any>
          ? {
              [QueryPropName in keyof Entities[EntityName]["links"]]?: any;
            }
          : never
        : never)
    | {} = {},
> =
  DB extends IDatabaseExperimental<infer Schema, any, any>
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
> = IDatabaseExperimental<Schema, R, CI>;

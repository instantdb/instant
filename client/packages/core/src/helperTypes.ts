import type {
  InstaQLQueryEntityResult,
  InstaQLQueryParams,
  InstaQLQueryResult,
  Remove$,
} from "./queryTypes";
import type { InstantGraph } from "./schemaTypes";
import type { IDatabaseExperimental } from "./coreTypes";
import { RoomSchemaShape } from "./presence";

export type InstantQuery<DB extends IDatabaseExperimental<any>> =
  DB extends IDatabaseExperimental<infer Schema>
    ? Schema extends InstantGraph<any, any, any>
      ? InstaQLQueryParams<Schema>
      : never
    : never;

export type InstantQueryResult<DB extends IDatabaseExperimental<any>, Q> =
  DB extends IDatabaseExperimental<infer Schema>
    ? Schema extends InstantGraph<infer E, any>
      ? InstaQLQueryResult<E, Remove$<Q>>
      : never
    : never;

export type InstantSchema<DB extends IDatabaseExperimental<any>> =
  DB extends IDatabaseExperimental<infer Schema> ? Schema : never;

export type InstantEntity<
  DB extends IDatabaseExperimental<any>,
  EntityName extends DB extends IDatabaseExperimental<infer Schema>
    ? Schema extends InstantGraph<infer Entities, any>
      ? keyof Entities
      : never
    : never,
  Query extends
    | (DB extends IDatabaseExperimental<infer Schema>
        ? Schema extends InstantGraph<infer Entities, any>
          ? {
              [QueryPropName in keyof Entities[EntityName]["links"]]?: any;
            }
          : never
        : never)
    // XXX: is this check needed anymore?
    | {} = {},
> =
  DB extends IDatabaseExperimental<infer Schema>
    ? Schema extends InstantGraph<infer Entities, any>
      ? EntityName extends keyof Entities
        ? InstaQLQueryEntityResult<Entities, EntityName, Query>
        : never
      : never
    : never;

export type InstantSchemaDatabase<Schema extends InstantGraph<any, any>> =
  IDatabaseExperimental<Schema>;

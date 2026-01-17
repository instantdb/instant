import type {
  InstaQLEntity,
  InstaQLResult,
  InstaQLParams,
  Remove$,
} from './queryTypes.ts';
import type {
  IContainEntitiesAndLinks,
  InstantSchemaDef,
} from './schemaTypes.ts';
import type { IInstantDatabase } from './coreTypes.ts';

/**
 * @deprecated
 * `InstantQuery` is deprecated. Use `InstaQLParams` instead.
 *
 * @example
 *  // Before
 *  const db = init_experimental({ ...config, schema });
 *  type DB = typeof db;
 *  const myQuery = { ... } satisfies InstantQuery<DB>;
 *
 *  // After
 *  type Schema = typeof schema;
 *  const myQuery = { ... } satisfies InstaQLParams<Schema>;
 */
export type InstantQuery<DB extends IInstantDatabase<any>> =
  DB extends IInstantDatabase<infer Schema> ? InstaQLParams<Schema> : never;

/**
 * @deprecated
 * `InstantQueryResult` is deprecated. Use `InstaQLResult` instead.
 *
 * @example
 * // Before
 * const db = init_experimental({ ...config, schema });
 * type DB = typeof db;
 * type MyQueryResult = InstantQueryResult<DB, typeof myQuery>;
 *
 * // After
 * type Schema = typeof schema;
 * type MyQueryResult = InstaQLResult<Schema, typeof myQuery>;
 */
export type InstantQueryResult<DB extends IInstantDatabase<any>, Q> =
  DB extends IInstantDatabase<infer Schema>
    ? Q extends InstaQLParams<Schema> | undefined
      ? InstaQLResult<Schema, Remove$<Q>>
      : never
    : never;
/**
 * @deprecated
 * `InstantSchema` is deprecated. Use typeof schema directly:
 * @example
 * // Before
 * const db = init_experimental({ ...config, schema });
 * type Schema = InstantSchema<typeof db>;
 *
 * // After
 * type Schema = typeof schema;
 */
export type InstantSchema<DB extends IInstantDatabase<any>> =
  DB extends IInstantDatabase<infer Schema> ? Schema : never;

/**
 * @deprecated
 * `InstantEntity` is deprecated. Use `InstaQLEntity` instead.
 *
 * @example
 * // Before
 * const db = init_experimental({ ...config, schema });
 * type DB = typeof db;
 * type MyEntity = InstantEntity<DB, "myEntityName">;
 *
 * // After
 * type Schema = typeof schema;
 * type MyEntity = InstaQLEntity<Schema, "myEntityName">;
 */
export type InstantEntity<
  DB extends IInstantDatabase<any>,
  EntityName extends DB extends IInstantDatabase<infer Schema>
    ? Schema extends IContainEntitiesAndLinks<infer Entities, any>
      ? keyof Entities
      : never
    : never,
  Query extends
    | (DB extends IInstantDatabase<infer Schema>
        ? Schema extends IContainEntitiesAndLinks<infer Entities, any>
          ? {
              [QueryPropName in keyof Entities[EntityName]['links']]?: any;
            }
          : never
        : never)
    | {} = {},
> =
  DB extends IInstantDatabase<infer Schema>
    ? InstaQLEntity<Schema, EntityName, Query>
    : never;

/**
 * @deprecated
 * `InstantSchemaDatabase` is deprecated. You generally don't need to
 * create a return type for a DB. But, if you like you can use `IInstantDatabase`:
 *
 * @example
 * // Before
 * type DB = InstantSchemaDatabase<typeof schema>;
 *
 * // After
 * type DB = IInstantDatabase<typeof schema>;
 */
export type InstantSchemaDatabase<
  Schema extends InstantSchemaDef<any, any, any>,
  _T1 extends any = any,
  _T2 extends any = any,
> = IInstantDatabase<Schema>;

// Query
// -----

import type {
  EntitiesDef,
  IContainEntitiesAndLinks,
  InstantGraph,
  LinkAttrDef,
  RuleParams,
  ResolveAttrs,
  ResolveEntityAttrs,
  DataAttrDef,
  AttrsDefs,
  EntityDefFromSchema,
  InstantUnknownSchemaDef,
} from './schemaTypes.ts';

type BuiltIn = Date | Function | Error | RegExp;

type Primitive = string | number | boolean | symbol | null | undefined;

export type Expand<T> = T extends BuiltIn | Primitive
  ? T
  : T extends object
    ? T extends infer O
      ? { [K in keyof O]: Expand<O[K]> }
      : never
    : T;

// NonEmpty disallows {}, so that you must provide at least one field
export type NonEmpty<T> = {
  [K in keyof T]-?: Required<Pick<T, K>>;
}[keyof T];

type BaseWhereClauseValueComplex<V> = {
  /** @deprecated use `$in` instead of `in` */
  in?: V[];
  $in?: V[];
  /** @deprecated use `$ne` instead of `not` */
  $not?: V;
  $ne?: V;
  $gt?: V;
  $lt?: V;
  $gte?: V;
  $lte?: V;
};

type IsAny<T> = boolean extends (T extends never ? true : false) ? true : false;

type WhereClauseValueComplex<V, R, I> = BaseWhereClauseValueComplex<V> &
  (IsAny<V> extends true
    ? {
        $ilike?: string;
        $like?: string;
        $isNull?: boolean;
      }
    : (V extends string
        ? {
            $like?: string;
          }
        : {}) &
        (R extends false
          ? {
              $isNull?: boolean;
            }
          : {}) &
        (I extends true
          ? {
              $ilike?: string;
            }
          : {}));

// Make type display better
type WhereClauseValue<
  D extends DataAttrDef<string | number | boolean, boolean, boolean>,
> =
  D extends DataAttrDef<infer V, infer R, infer I>
    ?
        | (IsAny<V> extends true ? string | number | boolean : V)
        | NonEmpty<WhereClauseValueComplex<V, R, I>>
    : never;

type WhereClauseColumnEntries<
  T extends {
    [key: string]: DataAttrDef<any, boolean, boolean>;
  },
> = {
  [key in keyof T]?: WhereClauseValue<T[key]>;
};

type WhereClauseComboEntries<
  T extends Record<any, DataAttrDef<any, boolean, boolean>>,
> = {
  or?: WhereClauses<T>[] | WhereClauseValue<DataAttrDef<any, false, true>>;
  and?: WhereClauses<T>[] | WhereClauseValue<DataAttrDef<any, false, true>>;
};

type WhereClauses<T extends Record<any, DataAttrDef<any, boolean, boolean>>> = (
  | WhereClauseComboEntries<T>
  | (WhereClauseComboEntries<T> & WhereClauseColumnEntries<T>)
) & {
  id?: WhereClauseValue<DataAttrDef<string, false, true>>;
  [key: `${string}.${string}`]: WhereClauseValue<DataAttrDef<any, false, true>>;
};

/**
 * A tuple representing a cursor.
 * These should not be constructed manually. The current format
 * is an implementation detail that may change in the future.
 * Use the `endCursor` or `startCursor` from the PageInfoResponse as the
 * `before` or `after` field in the query options.
 */
type Cursor = [string, string, any, number];

type Direction = 'asc' | 'desc';

type IndexedKeys<Attrs extends AttrsDefs> = {
  [K in keyof Attrs]: Attrs[K] extends DataAttrDef<any, any, infer IsIndexed>
    ? IsIndexed extends true
      ? K
      : never
    : never;
}[keyof Attrs];

export type Order<
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> =
  IndexedKeys<Schema['entities'][EntityName]['attrs']> extends never
    ? {
        serverCreatedAt?: Direction;
      }
    : {
        [K in IndexedKeys<Schema['entities'][EntityName]['attrs']>]?: Direction;
      } & {
        serverCreatedAt?: Direction;
      };

type $Option<
  S extends IContainEntitiesAndLinks<any, any>,
  K extends keyof S['entities'],
> = {
  $?: {
    where?: WhereClauses<EntityDefFromSchema<S, K>>;
    order?: Order<S, K>;
    limit?: number;
    last?: number;
    first?: number;
    offset?: number;
    after?: Cursor;
    before?: Cursor;
    fields?: InstaQLFields<S, K>;
  };
};

type NamespaceVal =
  | $Option<IContainEntitiesAndLinks<any, any>, keyof EntitiesDef>
  | ($Option<IContainEntitiesAndLinks<any, any>, keyof EntitiesDef> & Subquery);

type Subquery = { [namespace: string]: NamespaceVal };

interface Query {
  [namespace: string]: NamespaceVal;
}

type InstantObject = {
  id: string;
  [prop: string]: any;
};

type ResponseObject<K, Schema> = K extends keyof Schema
  ? { id: string } & Schema[K]
  : InstantObject;

type IsEmptyObject<T> = T extends Record<string, never> ? true : false;

type ResponseOf<Q, Schema> = {
  [K in keyof Q]: IsEmptyObject<Q[K]> extends true
    ? ResponseObject<K, Schema>[]
    : (ResponseOf<Q[K], Schema> & ResponseObject<K, Schema>)[];
};

type Remove$<T> = T extends object
  ? { [K in keyof T as Exclude<K, '$'>]: Remove$<T[K]> }
  : T;

type Remove$NonRecursive<T> = T extends object
  ? { [K in keyof T as Exclude<K, '$'>]: T[K] }
  : T;

type QueryResponse<
  Q,
  Schema,
  WithCardinalityInference extends boolean = false,
  UseDates extends boolean = false,
> =
  Schema extends InstantGraph<infer E, any>
    ? InstaQLQueryResult<E, Q, WithCardinalityInference, UseDates>
    : ResponseOf<{ [K in keyof Q]: Remove$<Q[K]> }, Schema>;

type InstaQLResponse<Schema, Q, UseDates extends boolean = false> =
  Schema extends IContainEntitiesAndLinks<any, any>
    ? Q extends InstaQLParams<Schema> | undefined
      ? InstaQLResult<Schema, Q, UseDates>
      : never
    : never;

type PageInfoResponse<T> = {
  [K in keyof T]: {
    startCursor: Cursor;
    endCursor: Cursor;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

/**
 * (XXX)
 * https://github.com/microsoft/TypeScript/issues/26051
 *
 * Typescript can permit extra keys when a generic extends a type.
 *
 * For some reason, it makes it possible to write a query like so:
 *
 * dummyQuery({
 *  users: {
 *    $: { where: { "foo": 1 } },
 *    posts: {
 *      $: { "far": {} }
 *    }
 *  }
 *
 *  The problem: $: { "far": {} }
 *
 *  This passes, when it should in reality fail. I don't know why
 *  adding `Exactly` fixes this, but it does.
 *
 * */
type Exactly<Parent, Child> = Parent & {
  [K in keyof Child]: K extends keyof Parent ? Child[K] : never;
};

// SafeLookup<T, ['A', 'B', number]> is like doing
// T['A']['B'][number], but it will merge with undefined if any
// of the intermediates are undefined
type SafeLookup<T, K extends readonly PropertyKey[]> = K extends [
  infer First,
  ...infer Rest extends readonly PropertyKey[],
]
  ? First extends keyof NonNullable<T>
    ?
        | SafeLookup<NonNullable<T>[First], Rest>
        | (T extends null | undefined ? undefined : never)
    : undefined
  : T;

// ==========
// InstaQL helpers

type InstaQLEntitySubqueryResult<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  EntityName extends keyof Schema['entities'],
  Query extends InstaQLEntitySubquery<Schema, EntityName> | undefined = {},
  UseDates extends boolean = false,
> = {
  [QueryPropName in keyof Query]: Schema['entities'][EntityName]['links'][QueryPropName] extends LinkAttrDef<
    infer Cardinality,
    infer LinkedEntityName
  >
    ? LinkedEntityName extends keyof Schema['entities']
      ? Cardinality extends 'one'
        ?
            | InstaQLEntity<
                Schema,
                LinkedEntityName,
                Remove$NonRecursive<SafeLookup<Query, [QueryPropName]>>,
                SafeLookup<Query, [QueryPropName, '$', 'fields']>,
                UseDates
              >
            | undefined
        : InstaQLEntity<
            Schema,
            LinkedEntityName,
            Remove$NonRecursive<SafeLookup<Query, [QueryPropName]>>,
            SafeLookup<Query, [QueryPropName, '$', 'fields']>,
            UseDates
          >[]
      : never
    : never;
};

type InstaQLQueryEntityLinksResult<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
  Query extends {
    [LinkAttrName in keyof Entities[EntityName]['links']]?: any;
  },
  WithCardinalityInference extends boolean,
  UseDates extends boolean = false,
> = {
  [QueryPropName in keyof Query]: Entities[EntityName]['links'][QueryPropName] extends LinkAttrDef<
    infer Cardinality,
    infer LinkedEntityName
  >
    ? LinkedEntityName extends keyof Entities
      ? WithCardinalityInference extends true
        ? Cardinality extends 'one'
          ?
              | InstaQLQueryEntityResult<
                  Entities,
                  LinkedEntityName,
                  Query[QueryPropName],
                  WithCardinalityInference,
                  UseDates
                >
              | undefined
          : InstaQLQueryEntityResult<
              Entities,
              LinkedEntityName,
              Query[QueryPropName],
              WithCardinalityInference,
              UseDates
            >[]
        : InstaQLQueryEntityResult<
            Entities,
            LinkedEntityName,
            Query[QueryPropName],
            WithCardinalityInference,
            UseDates
          >[]
      : never
    : never;
};

// Pick, but applies the pick to each union
type DistributePick<T, K extends string> = T extends any
  ? { [P in K]: P extends keyof T ? T[P] : never }
  : never;

type InstaQLFields<
  S extends IContainEntitiesAndLinks<any, any>,
  K extends keyof S['entities'],
> = (Extract<keyof ResolveEntityAttrs<S['entities'][K]>, string> | 'id')[];

type ComputeAttrs<
  AllAttrs,
  Fields extends readonly string[] | undefined,
> = Fields extends readonly string[]
  ? DistributePick<AllAttrs, Exclude<Fields[number], 'id'>>
  : AllAttrs;

type InstaQLEntity<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  EntityName extends keyof Schema['entities'],
  Subquery extends InstaQLEntitySubquery<Schema, EntityName> | undefined = {},
  Fields extends InstaQLFields<Schema, EntityName> | undefined = undefined,
  UseDates extends boolean = false,
> = Expand<
  { id: string } & ComputeAttrs<
    ResolveEntityAttrs<Schema['entities'][EntityName], UseDates>,
    Fields
  > &
    InstaQLEntitySubqueryResult<Schema, EntityName, Subquery, UseDates>
>;

type InstaQLQueryEntityResult<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
  Query extends {
    [QueryPropName in keyof Entities[EntityName]['links']]?: any;
  },
  WithCardinalityInference extends boolean,
  UseDates extends boolean,
> = { id: string } & ResolveAttrs<Entities, EntityName, UseDates> &
  InstaQLQueryEntityLinksResult<
    Entities,
    EntityName,
    Query,
    WithCardinalityInference,
    UseDates
  >;

type InstaQLQueryResult<
  Entities extends EntitiesDef,
  Query,
  WithCardinalityInference extends boolean,
  UseDates extends boolean,
> = {
  [QueryPropName in keyof Query]: QueryPropName extends keyof Entities
    ? InstaQLQueryEntityResult<
        Entities,
        QueryPropName,
        Query[QueryPropName],
        WithCardinalityInference,
        UseDates
      >[]
    : never;
};

type InstaQLResult<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Query extends InstaQLParams<Schema> | undefined,
  UseDates extends boolean = false,
> = Expand<{
  [QueryPropName in keyof Query]: QueryPropName extends keyof Schema['entities']
    ? InstaQLEntity<
        Schema,
        QueryPropName,
        Remove$NonRecursive<SafeLookup<Query, [QueryPropName]>>,
        SafeLookup<Query, [QueryPropName, '$', 'fields']>,
        UseDates
      >[]
    : never;
}>;

type InstaQLEntitySubquery<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  EntityName extends keyof Schema['entities'],
> = {
  [QueryPropName in keyof Schema['entities'][EntityName]['links']]?:
    | $Option<Schema, EntityName>
    | ($Option<Schema, EntityName> &
        InstaQLEntitySubquery<
          Schema,
          Schema['entities'][EntityName]['links'][QueryPropName]['entityName']
        >);
};

type InstaQLQuerySubqueryParams<
  S extends IContainEntitiesAndLinks<any, any>,
  E extends keyof S['entities'],
> = {
  [K in keyof S['entities'][E]['links']]?:
    | $Option<S, S['entities'][E]['links'][K]['entityName']>
    | ($Option<S, S['entities'][E]['links'][K]['entityName']> &
        InstaQLQuerySubqueryParams<
          S,
          S['entities'][E]['links'][K]['entityName']
        >);
};

type InstaQLParams<S extends IContainEntitiesAndLinks<any, any>> = {
  [K in keyof S['entities']]?:
    | $Option<S, K>
    | ($Option<S, K> & InstaQLQuerySubqueryParams<S, K>);
};

/**
 * @deprecated
 * `InstaQLQueryParams` is deprecated. Use `InstaQLParams` instead.
 *
 * @example
 * // Before
 * const myQuery = {...} satisfies InstaQLQueryParams<Schema>
 * // After
 * const myQuery = {...} satisfies InstaQLParams<Schema>
 */
type InstaQLQueryParams<S extends IContainEntitiesAndLinks<any, any>> =
  InstaQLParams<S>;

type InstaQLOptions = {
  ruleParams: RuleParams;
};

// Start of new types

type ValidQueryObject<
  T extends Record<string, any>,
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
  TopLevel extends boolean,
> = keyof T extends keyof Schema['entities'][EntityName]['links'] | '$'
  ? {
      [K in keyof Schema['entities'][EntityName]['links']]?: ValidQueryObject<
        T[K],
        Schema,
        Schema['entities'][EntityName]['links'][K]['entityName'],
        false
      >;
    } & {
      $?: ValidDollarSignQuery<T['$'], Schema, EntityName, TopLevel>;
    }
  : never;

type PaginationKeys =
  | 'limit'
  | 'last'
  | 'first'
  | 'offset'
  | 'after'
  | 'before';

type AllowedDollarSignKeys<TopLevel extends boolean> = TopLevel extends true
  ? PaginationKeys | 'where' | 'fields' | 'order'
  : 'where' | 'fields' | 'order' | 'limit';

type ValidFieldNames<
  S extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof S['entities'],
> = Extract<keyof ResolveEntityAttrs<S['entities'][EntityName]>, string> | 'id';

type ValidDollarSignQuery<
  Input extends { [key: string]: any },
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
  TopLevel extends boolean,
> =
  keyof Input extends AllowedDollarSignKeys<TopLevel>
    ? {
        where?: ValidWhereObject<Input['where'], Schema, EntityName>;
        fields?: ValidFieldNames<Schema, EntityName>[];
        order?: Order<Schema, EntityName>;
        limit?: number;
      } & (TopLevel extends true
        ? {
            last?: number;
            first?: number;
            offset?: number;
            after?: Cursor;
            before?: Cursor;
          }
        : {})
    : never;

type StringifiableKey<T> = Extract<T, string | number | bigint | boolean>;

type ValidWhereNestedPath<
  T,
  K extends string | number | symbol,
  Schema extends IContainEntitiesAndLinks<any, any>,
> = T extends object
  ? K extends keyof T
    ? K // Allow link names as valid paths (they'll default to id)
    : K extends `${infer K0}.${infer KR}`
      ? K0 extends keyof T
        ? T[K0] extends keyof Schema['entities']
          ? `${K0}.${
              | ValidWhereNestedPath<
                  {
                    [K in keyof Schema['entities'][T[K0]]['links']]: Schema['entities'][T[K0]]['links'][K]['entityName'];
                  },
                  KR,
                  Schema
                >
              | StringifiableKey<keyof Schema['entities'][T[K0]]['attrs']>
              | 'id'}`
          : string & keyof T
        : string & keyof T
      : string & keyof T
  : never;

type ValidDotPath<
  Input extends string | number | symbol,
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> = ValidWhereNestedPath<
  {
    [K in keyof Schema['entities'][EntityName]['links']]: Schema['entities'][EntityName]['links'][K]['entityName'];
  },
  Input,
  Schema
>;

type WhereOperatorObject<Input, V, R, I> = keyof Input extends
  | keyof BaseWhereClauseValueComplex<V>
  | '$ilike'
  | '$like'
  | '$isNull'
  ? BaseWhereClauseValueComplex<V> &
      (IsAny<V> extends true
        ? {
            $ilike?: string;
            $like?: string;
            $isNull?: boolean;
          }
        : (V extends string
            ? {
                $like?: string;
              }
            : {}) &
            (R extends false
              ? {
                  $isNull?: boolean;
                }
              : {}) &
            (I extends true
              ? {
                  $ilike?: string;
                }
              : {}))
  : never;

type ValidWhereValue<Input, AttrDef extends DataAttrDef<any, any, any>> =
  AttrDef extends DataAttrDef<infer V, infer R, infer I>
    ? Input extends V
      ? V
      : NonEmpty<WhereOperatorObject<Input, V, R, I>>
    : never;

type NoDistribute<T> = [T] extends [any] ? T : never;

type ValidWhereObject<
  Input extends { [key: string]: any } | undefined,
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> = Input extends undefined
  ? undefined
  : keyof Input extends
        | ValidDotPath<keyof Input, Schema, EntityName>
        | keyof Schema['entities'][EntityName]['attrs']
        | 'and'
        | 'or'
        | 'id'
    ? {
        [K in ValidDotPath<keyof Input, Schema, EntityName>]?: ValidWhereValue<
          Input[K],
          ExtractAttrFromDotPath<K, Schema, EntityName>
        >;
      } & {
        [K in keyof Schema['entities'][EntityName]['attrs']]?: ValidWhereValue<
          Input[K],
          Schema['entities'][EntityName]['attrs'][K]
        >;
      } & {
        and?: Input extends {
          and: Array<infer Item extends { [key: string]: any } | undefined>;
        }
          ? ValidWhereObject<NoDistribute<Item>, Schema, EntityName>[]
          : never;
        or?: Input extends {
          or: Array<infer Item extends { [key: string]: any } | undefined>;
        }
          ? ValidWhereObject<NoDistribute<Item>, Schema, EntityName>[]
          : never;
      } & {
        // Special case for id
        id?: ValidWhereValue<
          SafeLookup<Input, ['id']>,
          DataAttrDef<string, false, false>
        >;
      }
    : never;

/**
 * Extracts the attribute definition from a valid dot path.
 * Given a dot path like "user.posts.title", this will resolve to the type of the "title" attribute.
 * If the path is just a link name (e.g., "posts"), it defaults to the id field.
 * Returns DataAttrDef or never
 */
type ExtractAttrFromDotPath<
  Path extends string | number | symbol,
  Schema extends IContainEntitiesAndLinks<any, any>,
  EntityName extends keyof Schema['entities'],
> = Path extends keyof Schema['entities'][EntityName]['attrs']
  ? Schema['entities'][EntityName]['attrs'][Path]
  : Path extends 'id'
    ? DataAttrDef<string, false, false>
    : Path extends `${infer LinkName}.${infer RestPath}`
      ? LinkName extends keyof Schema['entities'][EntityName]['links']
        ? ExtractAttrFromDotPath<
            RestPath,
            Schema,
            Schema['entities'][EntityName]['links'][LinkName]['entityName']
          >
        : never
      : Path extends keyof Schema['entities'][EntityName]['links']
        ? DataAttrDef<string, false, false>
        : never;

type ValidQuery<
  Q extends Record<string, any>,
  S extends IContainEntitiesAndLinks<any, any>,
> = S extends InstantUnknownSchemaDef
  ? InstaQLParams<S>
  : keyof Q extends keyof S['entities']
    ? {
        [K in keyof S['entities']]?: ValidQueryObject<Q[K], S, K, true>;
      }
    : never;

export {
  Query,
  QueryResponse,
  InstaQLResponse,
  PageInfoResponse,
  InstantObject,
  Exactly,
  Remove$,
  ValidQuery,
  InstaQLQueryResult,
  InstaQLParams,
  InstaQLOptions,
  InstaQLQueryEntityResult,
  InstaQLEntitySubquery,
  InstaQLEntity,
  InstaQLResult,
  InstaQLFields,
  Cursor,
  InstaQLQueryParams,
};

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
} from './schemaTypes.ts';

type BuiltIn = Date | Function | Error | RegExp;

type Primitive = string | number | boolean | symbol | null | undefined;

type Expand<T> = T extends BuiltIn | Primitive
  ? T
  : T extends object
    ? T extends infer O
      ? { [K in keyof O]: Expand<O[K]> }
      : never
    : T;

// NonEmpty disallows {}, so that you must provide at least one field
type NonEmpty<T> = {
  [K in keyof T]-?: Required<Pick<T, K>>;
}[keyof T];

// Branded Schemaless unknown
type BSUnknown = { _unknown: '_unknown' };

type AnyWhereArgs = {
  /** @deprecated use `$in` instead of `in` */
  in?: (string | number | boolean)[];
  $in?: (string | number | boolean)[];
  $not?: string | number | boolean;
  $isNull?: boolean;
  $gt?: string | number | boolean;
  $lt?: string | number | boolean;
  $gte?: string | number | boolean;
  $lte?: string | number | boolean;
  $like?: string;
  $ilike?: string;
};

type BaseWhereClauses<V> = {
  in?: V[];
  $in?: V[];
  $not?: V;
  $gt?: V;
  $lt?: V;
  $gte?: V;
  $lte?: V;
};

type WhereArgs<V> = V extends BSUnknown
  ? AnyWhereArgs
  : BaseWhereClauses<V> &
      (V extends string
        ? {
            $like?: string;
            $ilike?: string;
          }
        : {}) &
      (undefined extends V
        ? {
            $isNull?: boolean;
          }
        : {});

// Make type display better
type WhereClauseValue<V> =
  | (V extends BSUnknown
      ? string | number | boolean
      : V extends string | undefined
        ? string
        : V extends number | undefined
          ? number
          : V extends boolean | undefined
            ? boolean
            : never)
  | Expand<WhereArgs<V>>;

type BaseWhereClause<
  T extends {
    [key: string]: unknown;
  },
> = {
  [key in keyof T]?: WhereClauseValue<T[key]>;
};

// Helper type to infer the value type from a nested path
type InferNestedValueType<
  S extends IContainEntitiesAndLinks<any, any>,
  K extends keyof S['entities'],
  Path extends string,
  Depth extends number = 3,
> = Depth extends 0
  ? BSUnknown
  : Path extends `${infer LinkName}.${infer RestPath}`
    ? LinkName extends keyof S['entities'][K]['links']
      ? S['entities'][K]['links'][LinkName] extends LinkAttrDef<
          any,
          infer LinkedEntityName
        >
        ? LinkedEntityName extends keyof S['entities']
          ? InferNestedValueType<
              S,
              LinkedEntityName,
              RestPath,
              [never, 0, 1, 2, 3][Depth]
            >
          : BSUnknown
        : BSUnknown
      : BSUnknown
    : Path extends keyof ResolveEntityAttrs<S['entities'][K]>
      ? ResolveEntityAttrs<S['entities'][K]>[Path]
      : BSUnknown;

type WhereClause<
  S extends IContainEntitiesAndLinks<any, any>,
  K extends keyof S['entities'],
> = BaseAttrWhereClause<InstaQLEntity<S, K>> & {
  [Path in InferNestedPath<S, K>]?: WhereClauseValue<
    InferNestedValueType<S, K, Path, 4>
  >;
} & {
  // Allow any deeply nested path with BSUnknown typing
  [key: `${string}.${string}.${string}.${string}`]: WhereClauseValue<BSUnknown>;
};

// Helper type to get valid nested paths
type InferNestedPath<
  S extends IContainEntitiesAndLinks<any, any>,
  K extends keyof S['entities'],
  Depth extends number = 4,
> = Depth extends 0
  ? // At depth 0, allow any string path for BSUnknown typing
    `${string}.${string}`
  : // Direct attributes of the entity
    | Extract<keyof ResolveEntityAttrs<S['entities'][K]>, string>
      // Nested paths through links (link.attribute)
      | {
          [LinkName in keyof S['entities'][K]['links']]: S['entities'][K]['links'][LinkName] extends LinkAttrDef<
            any,
            infer LinkedEntityName
          >
            ? LinkedEntityName extends keyof S['entities']
              ? `${Extract<LinkName, string>}.${InferNestedPath<
                  S,
                  LinkedEntityName,
                  [never, 0, 1, 2, 3][Depth]
                >}`
              : never
            : never;
        }[keyof S['entities'][K]['links']];

type WhereClauseWithCombination<T extends Record<any, unknown>> = {
  or?: BaseAttrWhereClause<T>[] | WhereClauseValue<BSUnknown>;
  and?: BaseAttrWhereClause<T>[] | WhereClauseValue<BSUnknown>;
};

type BaseAttrWhereClause<T extends Record<any, any>> =
  | WhereClauseWithCombination<T>
  | (WhereClauseWithCombination<T> & BaseWhereClause<T>);

/**
 * A tuple representing a cursor.
 * These should not be constructed manually. The current format
 * is an implementation detail that may change in the future.
 * Use the `endCursor` or `startCursor` from the PageInfoResponse as the
 * `before` or `after` field in the query options.
 */
type Cursor = [string, string, any, number];

type Direction = 'asc' | 'desc';

type Order = { [key: string]: Direction };

type $Option<
  Fields extends string[],
  WhereFieldTypes extends {
    [key: string]: any;
  } = Record<any, BSUnknown>,
> = {
  $?: {
    where?: BaseAttrWhereClause<WhereFieldTypes>;
    order?: Order;
    limit?: number;
    last?: number;
    first?: number;
    offset?: number;
    after?: Cursor;
    before?: Cursor;
    fields?: Fields;
  };
};

// Helper type to check if an entity has index signature (unknown schema)
type HasIndexSignature<T> = string extends keyof T ? true : false;

// Typed version that supports dot notation for nested queries
type $OptionWNest<
  S extends IContainEntitiesAndLinks<any, any>,
  K extends keyof S['entities'],
> = {
  $?: {
    where?: WhereClause<S, K>;
    order?: Order;
    limit?: number;
    last?: number;
    first?: number;
    offset?: number;
    after?: Cursor;
    before?: Cursor;
    fields?: HasIndexSignature<InstaQLEntity<S, K>> extends true
      ? string[]
      : keyof InstaQLEntity<S, K>[];
  };
};

type Subquery = { [namespace: string]: NamespaceVal };

type NamespaceVal = $Option<string[]> | ($Option<string[]> & Subquery);

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
> =
  Schema extends InstantGraph<infer E, any>
    ? InstaQLQueryResult<E, Q, WithCardinalityInference>
    : ResponseOf<{ [K in keyof Q]: Remove$<Q[K]> }, Schema>;

type InstaQLResponse<Schema, Q> =
  Schema extends IContainEntitiesAndLinks<any, any>
    ? InstaQLResult<Schema, Q>
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

// ==========
// InstaQL helpers

type InstaQLEntitySubqueryResult<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  EntityName extends keyof Schema['entities'],
  Query extends InstaQLEntitySubquery<Schema, EntityName> = {},
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
                Remove$NonRecursive<Query[QueryPropName]>,
                Query[QueryPropName]['$']['fields']
              >
            | undefined
        : InstaQLEntity<
            Schema,
            LinkedEntityName,
            Remove$NonRecursive<Query[QueryPropName]>,
            Query[QueryPropName]['$']['fields']
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
                  WithCardinalityInference
                >
              | undefined
          : InstaQLQueryEntityResult<
              Entities,
              LinkedEntityName,
              Query[QueryPropName],
              WithCardinalityInference
            >[]
        : InstaQLQueryEntityResult<
            Entities,
            LinkedEntityName,
            Query[QueryPropName],
            WithCardinalityInference
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

type InstaQLEntity<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  EntityName extends keyof Schema['entities'],
  Subquery extends InstaQLEntitySubquery<Schema, EntityName> = {},
  Fields extends InstaQLFields<Schema, EntityName> | undefined = undefined,
> = Expand<
  { id: string } & (Extract<Fields[number], string> extends undefined
    ? ResolveEntityAttrs<Schema['entities'][EntityName]>
    : DistributePick<
        ResolveEntityAttrs<Schema['entities'][EntityName]>,
        Exclude<Fields[number], 'id'>
      >) &
    InstaQLEntitySubqueryResult<Schema, EntityName, Subquery>
>;

type InstaQLQueryEntityResult<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
  Query extends {
    [QueryPropName in keyof Entities[EntityName]['links']]?: any;
  },
  WithCardinalityInference extends boolean,
> = { id: string } & ResolveAttrs<Entities, EntityName> &
  InstaQLQueryEntityLinksResult<
    Entities,
    EntityName,
    Query,
    WithCardinalityInference
  >;

type InstaQLQueryResult<
  Entities extends EntitiesDef,
  Query,
  WithCardinalityInference extends boolean,
> = {
  [QueryPropName in keyof Query]: QueryPropName extends keyof Entities
    ? InstaQLQueryEntityResult<
        Entities,
        QueryPropName,
        Query[QueryPropName],
        WithCardinalityInference
      >[]
    : never;
};

type InstaQLResult<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  Query extends InstaQLParams<Schema>,
> = Expand<{
  [QueryPropName in keyof Query]: QueryPropName extends keyof Schema['entities']
    ? InstaQLEntity<
        Schema,
        QueryPropName,
        Remove$NonRecursive<Query[QueryPropName]>,
        InstaQLFields<Schema, QueryPropName>
      >[]
    : never;
}>;

type InstaQLEntitySubquery<
  Schema extends IContainEntitiesAndLinks<EntitiesDef, any>,
  EntityName extends keyof Schema['entities'],
> = {
  [QueryPropName in keyof Schema['entities'][EntityName]['links']]?:
    | $Option<InstaQLFields<Schema, EntityName>>
    | ($Option<InstaQLFields<Schema, EntityName>> &
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
    | $OptionWNest<S, S['entities'][E]['links'][K]['entityName']>
    | ($OptionWNest<S, S['entities'][E]['links'][K]['entityName']> &
        InstaQLQuerySubqueryParams<
          S,
          S['entities'][E]['links'][K]['entityName']
        >);
};

type InstaQLParams<S extends IContainEntitiesAndLinks<any, any>> = {
  [K in keyof S['entities']]?:
    | $OptionWNest<S, K>
    | ($OptionWNest<S, K> & InstaQLQuerySubqueryParams<S, K>);
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

export {
  Query,
  QueryResponse,
  InstaQLResponse,
  PageInfoResponse,
  InstantObject,
  Exactly,
  Remove$,
  InstaQLQueryResult,
  InstaQLParams,
  InstaQLOptions,
  InstaQLQueryEntityResult,
  InstaQLEntity,
  InstaQLResult,
  InstaQLFields,
  Cursor,
  InstaQLQueryParams,
};

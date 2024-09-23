// Query
// -----

import type {
  EntitiesDef,
  InstantGraph,
  LinkAttrDef,
  ResolveAttrs,
} from "./schemaTypes";

// NonEmpty disallows {}, so that you must provide at least one field
type NonEmpty<T> = {
  [K in keyof T]-?: Required<Pick<T, K>>;
}[keyof T];

type WhereArgs = {
  in?: (string | number | boolean)[];
};

type WhereClauseValue = string | number | boolean | NonEmpty<WhereArgs>;

type BaseWhereClause = {
  [key: string]: WhereClauseValue;
};

type WhereClauseWithCombination = {
  or?: WhereClause[] | WhereClauseValue;
  and?: WhereClause[] | WhereClauseValue;
};

type WhereClause =
  | WhereClauseWithCombination
  | (WhereClauseWithCombination & BaseWhereClause);

/**
 * A tuple representing a cursor.
 * These should not be constructed manually. The current format
 * is an implementation detail that may change in the future.
 * Use the `endCursor` or `startCursor` from the PageInfoResponse as the
 * `before` or `after` field in the query options.
 */
type Cursor = [string, string, any, number];

type Direction = "asc" | "desc";

type Order = { serverCreatedAt: Direction };

type $Option = {
  $?: {
    where?: WhereClause;
    order?: Order;
    limit?: number;
    last?: number;
    first?: number;
    offset?: number;
    after?: Cursor;
    before?: Cursor;
  };
};

type Subquery = { [namespace: string]: NamespaceVal };

type NamespaceVal = $Option | ($Option & Subquery);

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
  ? { [K in keyof T as Exclude<K, "$">]: Remove$<T[K]> }
  : T;

type QueryResponse<
  Q,
  Schema,
  WithCardinalityInference extends boolean = false,
> =
  Schema extends InstantGraph<infer E, any>
    ? InstaQLQueryResult<E, Q, WithCardinalityInference>
    : ResponseOf<{ [K in keyof Q]: Remove$<Q[K]> }, Schema>;

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

type InstaQLQueryEntityLinksResult<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
  Query extends {
    [LinkAttrName in keyof Entities[EntityName]["links"]]?: any;
  },
  WithCardinalityInference extends boolean,
> = {
  [QueryPropName in keyof Query]: Entities[EntityName]["links"][QueryPropName] extends LinkAttrDef<
    infer Cardinality,
    infer LinkedEntityName
  >
    ? LinkedEntityName extends keyof Entities
      ? WithCardinalityInference extends true
        ? Cardinality extends "one"
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

type InstaQLQueryEntityResult<
  Entities extends EntitiesDef,
  EntityName extends keyof Entities,
  Query extends {
    [QueryPropName in keyof Entities[EntityName]["links"]]?: any;
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

type InstaQLQuerySubqueryParams<
  S extends InstantGraph<any, any>,
  E extends keyof S["entities"],
> = {
  [K in keyof S["entities"][E]["links"]]?:
    | $Option
    | ($Option &
        InstaQLQuerySubqueryParams<
          S,
          S["entities"][E]["links"][K]["entityName"]
        >);
};

type InstaQLQueryParams<S extends InstantGraph<any, any>> = {
  [K in keyof S["entities"]]?:
    | $Option
    | ($Option & InstaQLQuerySubqueryParams<S, K>);
};

export {
  Query,
  QueryResponse,
  PageInfoResponse,
  InstantObject,
  Exactly,
  Remove$,
  InstaQLQueryResult,
  InstaQLQueryParams,
  Cursor,
};

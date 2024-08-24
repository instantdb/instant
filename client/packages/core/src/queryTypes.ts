// Query
// -----

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

type QueryResponse<T, Schema> = ResponseOf<
  { [K in keyof T]: Remove$<T[K]> },
  Schema
>;

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
type Exactly<Parent, Child extends Parent> = Parent & {
  [K in keyof Child]: K extends keyof Parent ? Child[K] : never;
};

export { Query, QueryResponse, PageInfoResponse, InstantObject, Exactly };

// --------
// Sanity check tests

/**
 * The purpose of these sanity checks:
 * If we make changes and something breaks, our build will fail.
 *
 * AFAIK we _could_ write this in our `tests` folder.
 * The latest version of `vitest` does support `assertType`, but:
 *  * it's easy to get false positives if configured incorrectly
 *  * the api is more vebose than this
 */

function dummyQuery<Q extends Query>(
  _query: Exactly<Query, Q>,
): QueryResponse<Q, unknown> {
  return 1 as any;
}

interface ExUser {
  name: string;
}

interface ExPost {
  title: string;
}

interface ExSchema {
  users: ExUser;
  posts: ExPost;
}

function dummySchemaQuery<Q extends Query>(
  _query: Exactly<Query, Q>,
): QueryResponse<Q, ExSchema> {
  return 1 as any;
}

const sanityCheckQueries = () => {
  // -----------
  // Basic good inputs succeed
  const r = dummyQuery({ users: {} });

  // -----------
  // Basic bad inputs fails

  // @ts-expect-error
  const r2 = dummyQuery({ users: 1 });
  // @ts-expect-error
  const r3 = dummyQuery({ users: "" });

  // ----------------------
  // Good $ clauses succeed

  const r4 = dummyQuery({ users: { $: { where: { foo: 1 } } } });
  const r5 = dummyQuery({ users: { $: { where: { foo: "str" } } } });
  const r6 = dummyQuery({ users: { $: { where: { foo: true } } } });
  const r7 = dummyQuery({ users: { $: { where: { "foo.bar.baz": 1 } } } });
  const s1 = dummyQuery({
    users: { $: { where: { foo: { in: [1, 2, 3] } } } },
  });
  const t1 = dummyQuery({
    users: { $: { where: { or: [{ foo: 1 }] } } },
  });
  // You can have a field named or
  const t2 = dummyQuery({
    users: { $: { where: { or: "fieldNamedOr" } } },
  });
  const t3 = dummyQuery({
    users: { $: { where: { and: [{ foo: 1 }] } } },
  });
  // You can have a field named and
  const t4 = dummyQuery({
    users: { $: { where: { and: "fieldNamedAnd" } } },
  });
  const t5 = dummyQuery({
    users: { $: { where: { and: [{ or: [{ foo: 1 }] }] } } },
  });
  // Pagination
  const t6 = dummyQuery({
    users: { $: { limit: 10 } },
  });
  const t7 = dummyQuery({
    users: { $: { limit: 10, offset: 10 } },
  });
  const t8 = dummyQuery({
    users: { $: { where: { foo: 1 }, limit: 10, offset: 10 } },
  });
  const cursor: Cursor = [
    "61935703-bec6-4ade-ad9b-8bf382b92f69",
    "995f5a9b-9ae1-4e59-97d1-df33afb44aee",
    "61935703-bec6-4ade-ad9b-8bf382b92f69",
    10,
  ];
  const t9 = dummyQuery({
    users: {
      $: { where: { foo: 1 }, after: cursor },
    },
  });

  const t10 = dummyQuery({
    users: { $: { before: cursor } },
  });

  // ------------------
  // Bad $ clauses fail

  // @ts-expect-error
  const r8 = dummyQuery({ users: { $: { where: "foo" } } });
  // @ts-expect-error
  const r9 = dummyQuery({ users: { $: { where: { foo: {} } } } });
  // @ts-expect-error
  const r10 = dummyQuery({ users: { $: { where2: 1 } } });
  const s2 = dummyQuery({
    // @ts-expect-error
    users: { $: { where: { foo: { ini: [1, 2, 3] } } } },
  });
  const s3 = dummyQuery({
    // @ts-expect-error
    users: { $: { where: { foo: [] } } },
  });

  // ----------------
  // Good Nested queries succeed

  const r11 = dummyQuery({ users: { posts: {} } });
  const r12 = dummyQuery({ users: {}, posts: {} });
  const r13 = dummyQuery({
    users: {
      $: { where: { foo: 1 } },
      posts: { $: { where: { foo: 1 } } },
    },
  });

  // ----------
  // Bad nested queries fail

  // @ts-expect-error
  const r14 = dummyQuery({ users: { foo: 1 } });
};

const sanityCheckSchemalessResponses = () => {
  // Simple Response
  const r1: { users: InstantObject[] } = dummyQuery({ users: {} });
  // Nested Response
  const r2: { users: ({ posts: InstantObject[] } & InstantObject)[] } =
    dummyQuery({ users: { posts: {} } });
  // $ are ignored
  const r3: { users: ({ posts: InstantObject[] } & InstantObject)[] } =
    dummyQuery({
      users: {
        $: { where: { foo: 1 } },
        posts: {},
      },
    });
  // @ts-expect-error
  r3.$;
};

function sanityCheckSchemadResponses() {
  // simple response
  const r1: { users: ExUser[] } = dummySchemaQuery({ users: {} });
  // nested response
  const r2: { users: ({ posts: ExPost[] } & ExUser)[] } = dummySchemaQuery({
    users: { posts: {} },
  });
  // id included, but no other keys are allowed
  const r3 = dummySchemaQuery({ users: {} });
  const u = r3.users[0];
  const id: string = u.id;
  const name: string = u.name;
  // @ts-expect-error
  const title: string = u.title;
}

// --------
// Sanity check tests

import type {
  Cursor,
  Exactly,
  InstantObject,
  Query,
  QueryResponse,
} from './queryTypes.ts';

/**
 * The purpose of these sanity checks:
 * If we make changes and something breaks, our build will fail.
 *
 * AFAIK we _could_ write this in our `tests` folder.
 * The latest version of `vitest` does support `assertType`, but:
 *  * it's easy to get false positives if configured incorrectly
 *  * the api is more vebose than this
 */

export function dummyQuery<Q extends Query>(
  _query: Exactly<Query, Q>,
): QueryResponse<Q, unknown> {
  return 1 as any;
}

export interface ExUser {
  name: string;
}

export interface ExPost {
  title: string;
}

interface ExSchema {
  users: ExUser;
  posts: ExPost;
}

export function dummySchemaQuery<Q extends Query>(
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
  const r3 = dummyQuery({ users: '' });

  // ----------------------
  // Good $ clauses succeed
  const r4 = dummyQuery({ users: { $: { where: { foo: 1 } } } });
  const r5 = dummyQuery({ users: { $: { where: { foo: 'str' } } } });
  const r6 = dummyQuery({ users: { $: { where: { foo: true } } } });
  const r7 = dummyQuery({ users: { $: { where: { 'foo.bar.baz': 1 } } } });
  const s1 = dummyQuery({
    users: { $: { where: { foo: { in: [1, 2, 3] } } } },
  });
  const s1_5 = dummyQuery({
    users: { $: { where: { foo: { $in: [1, 2, 3] } } } },
  });
  const t1 = dummyQuery({
    users: { $: { where: { or: [{ foo: 1 }] } } },
  });
  // You can have a field named or
  const t2 = dummyQuery({
    users: { $: { where: { or: 'fieldNamedOr' } } },
  });
  const t3 = dummyQuery({
    users: { $: { where: { and: [{ foo: 1 }] } } },
  });
  // You can have a field named and
  const t4 = dummyQuery({
    users: { $: { where: { and: 'fieldNamedAnd' } } },
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
    '61935703-bec6-4ade-ad9b-8bf382b92f69',
    '995f5a9b-9ae1-4e59-97d1-df33afb44aee',
    '61935703-bec6-4ade-ad9b-8bf382b92f69',
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

  const t12 = dummyQuery({
    users: { $: { where: { val: { $isNull: true } } } },
  });

  const t13 = dummyQuery({
    users: { $: { where: { val: { $not: 'a' } } } },
  });

  const t14 = dummyQuery({
    users: {
      $: { fields: ['name', 'age', 'dob'] },
      posts: { $: { fields: ['title'] } },
    },
  });

  // ------------------
  // Bad $ clauses fail
  // @ts-expect-error
  const r8 = dummyQuery({ users: { $: { where: 'foo' } } });
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

  const s4 = dummyQuery({
    // @ts-expect-error
    users: { $: { where: { val: { $isNull: 'a' } } } },
  });

  const s5 = dummyQuery({
    // @ts-expect-error
    users: { $: { where: { val: { $not: { val: 'a' } } } } },
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

  const r15 = dummyQuery({
    // @ts-expect-error
    users: { $: { fields: 'name' } },
  });
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

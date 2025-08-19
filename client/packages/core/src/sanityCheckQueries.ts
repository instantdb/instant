// --------
// Sanity check tests

import type {
  Cursor,
  InstantObject,
  InstaQLParams,
  InstaQLResponse,
  ValidQuery,
} from './queryTypes.ts';
import { InstantUnknownSchema } from './schemaTypes.ts';

/**
 * The purpose of these sanity checks:
 * If we make changes and something breaks, our build will fail.
 *
 * AFAIK we _could_ write this in our `tests` folder.
 * The latest version of `vitest` does support `assertType`, but:
 *  * it's easy to get false positives if configured incorrectly
 *  * the api is more vebose than this
 */

export function dummyQuery<Q extends ValidQuery<Q, InstantUnknownSchema>>(
  _query: Q,
): InstaQLResponse<InstantUnknownSchema, Q> {
  return 1 as any;
}

export interface ExUser {
  name: string;
}

export interface ExPost {
  title: string;
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

  // #ts-expect-error
  const r9 = dummyQuery({ users: { $: { where: { foo: {} } } } });
  // @ts-expect-error
  const r10 = dummyQuery({ users: { $: { where2: 1 } } });
  const s2 = dummyQuery({
    // #ts-expect-error
    users: { $: { where: { foo: { ini: [1, 2, 3] } } } },
  });
  const s3 = dummyQuery({
    // #ts-expect-error
    users: { $: { where: { foo: [] } } },
  });

  const s4 = dummyQuery({
    // #ts-expect-error
    users: { $: { where: { val: { $isNull: 'a' } } } },
  });

  const s5 = dummyQuery({
    // @ts-expect-error
    users: { $: { where: { 'josijf.jsdfli': { $isNull: 'a' } } } },
  });
  // NOTE: Used to error before adding typesafe-where operator, issue is incompatibility
  // with NonEmpty and dynamic $isNull checks
  const s6 = dummyQuery({
    users: { $: { where: { val: { $gt: { val: 'a' } } } } },
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
  // #ts-expect-error
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

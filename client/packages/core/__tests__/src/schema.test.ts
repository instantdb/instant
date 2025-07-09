import { test } from 'vitest';

import { i } from '../../src';
import type {
  Exactly,
  InstaQLParams,
  InstaQLResponse,
  InstaQLResult,
} from '../../src/queryTypes';

test('runs without exception', () => {
  const schema = i.schema({
    entities: {
      users: i.entity({
        name: i.string(),
        email: i.string().indexed().unique(),
        bio: i.string().optional(),
        // this is a convenient way to typecheck custom JSON fields
        // though we should probably have a backend solution for this
        stuff: i.json<{ custom: string }>(),
        junk: i.any(),
      }),
      posts: i.entity({
        title: i.string(),
        body: i.string(),
      }),
      comments: i.entity({
        body: i.string(),
      }),
    },
    links: {
      usersPosts: {
        forward: {
          on: 'users',
          has: 'many',
          label: 'posts',
        },
        reverse: {
          on: 'posts',
          has: 'one',
          label: 'author',
        },
      },
      postsComments: {
        forward: {
          on: 'posts',
          has: 'many',
          label: 'comments',
        },
        reverse: {
          on: 'comments',
          has: 'one',
          label: 'post',
        },
      },
      friendships: {
        forward: {
          on: 'users',
          has: 'many',
          label: 'friends',
        },
        reverse: {
          on: 'users',
          has: 'many',
          label: '_friends',
        },
      },
      referrals: {
        forward: {
          on: 'users',
          has: 'many',
          label: 'referred',
        },
        reverse: {
          on: 'users',
          has: 'one',
          label: 'referrer',
        },
      },
    },
  });

  const demoQuery = {
    users: {
      friends: {
        _friends: {},
      },
      posts: {
        author: {},
        comments: {},
        $first: true,
      },
    },
  };

  type Schema = typeof schema;

  // Explore derived types
  type Test1 = Schema['entities']['users']['links']['_friends']['entityName'];
  type Test2 = Schema['entities']['users']['links']['_friends']['cardinality'];

  // Demo time!!!  Notice:
  // - everything is typed
  // - links are resolved by label, deeply
  // - only the links that were requested are present in the result
  // - friends is an array
  // - bio is optional (because `.optional()`)
  // - referrer is NOT an array (because cardinality is 'one')
  // - posts is not an array (because `$first`)
  const queryResult: DemoQueryResult = null as any;
  type DemoQueryResult = InstaQLResult<Schema, typeof demoQuery>;
  queryResult?.users[0].friends[0]._friends[0].bio;
  queryResult?.users[0].posts[0].author?.junk;

  // Test dot notation in where clauses
  const dotNotationQuery = {
    users: {
      $: {
        where: {
          // These should be valid dot notation paths
          'posts.title': 'Hello World',
          'posts.author.name': 'John',
          'posts.comments.body': 'Great post!',
          // Direct attributes should still work
          name: 'Alice',
          email: 'alice@example.com',
        },
      },
    },
  } satisfies InstaQLParams<Schema>;
  function dummyQuery<Q extends InstaQLParams<Schema>>(
    _query: Exactly<InstaQLParams<Schema>, Q>,
  ): InstaQLResponse<Schema, Q> {
    return 1 as any;
  }

  type QueryType = InstaQLParams<Schema>;
  const queryTypeTest: QueryType = {
    comments: {
      $: {
        where: {},
      },
    },
  };

  const result = dummyQuery({
    comments: {
      $: {
        where: {
          body: '',
        },
      },
    },
  });

  const lsidjf = dummyQuery({
    users: {
      $: {
        where: {
          name: 'drew',
        },
        fields: ['name'],
      },
      friends: {
        $: {
          fields: ['bio'],
        },
      },
    },
  });

  dummyQuery({
    comments: {
      $: {
        where: {
          and: [
            {
              body: '8932',
            },
          ],
        },
      },
    },
  });

  // ===== COMPREHENSIVE TEST QUERIES =====

  // Basic filtering with different operators
  dummyQuery({
    users: {
      $: {
        where: {
          name: 'John',
          email: { $like: '%@gmail.com' },
          bio: { $not: 'somevalue' },
        },
      },
    },
  });

  // Numeric comparisons
  dummyQuery({
    posts: {
      $: {
        where: {
          // Using any field for numeric comparisons since we don't have numeric fields
          // This tests the BSUnknown typing
          'author.stuff.custom': { $gt: 'a', $lt: 'z' },
        },
      },
    },
  });

  // Array operations
  dummyQuery({
    users: {
      $: {
        where: {
          name: { $in: ['Alice', 'Bob', 'Charlie'] },
          email: { $not: 'spam@example.com' },
        },
      },
    },
  });

  // Complex AND/OR logic
  dummyQuery({
    users: {
      $: {
        where: {
          and: [
            { name: { $like: 'A%' } },
            {
              or: [
                { email: { $like: '%@gmail.com' } },
                { email: { $like: '%@yahoo.com' } },
              ],
            },
          ],
        },
      },
    },
  });

  // Field selection
  dummyQuery({
    users: {
      $: {
        fields: ['name', 'email'],
      },
    },
  });

  // Nested queries with filtering
  const sldfjlsid = dummyQuery({
    users: {
      posts: {
        $: {
          where: {
            title: { $like: '%tutorial%' },
          },
          fields: ['body'],
        },
        comments: {
          $: {
            where: {
              body: { $like: '%great%' },
            },
          },
        },
      },
    },
  });

  // Deep nested queries
  dummyQuery({
    users: {
      friends: {
        posts: {
          author: {
            $: {
              where: {
                name: { $like: 'A%' },
              },
            },
          },
          comments: {
            $: {
              // no where/fields for this one
            },
          },
        },
      },
    },
  });

  // Self-referencing relationships
  dummyQuery({
    users: {
      friends: {
        _friends: {
          $: {
            where: {
              name: { $like: 'B%' },
            },
          },
        },
      },
    },
  });

  // Referral chain queries
  dummyQuery({
    users: {
      referrer: {
        referred: {
          $: {
            where: {
              email: { $like: '%@company.com' },
            },
          },
        },
      },
    },
  });

  // Complex nested filtering with dot notation
  const resulsjdlf = dummyQuery({
    users: {
      $: {
        where: {
          'posts.title': { $like: '%important%' },
          'posts.comments.body': { $like: '%urgent%' },
          'friends.name': { $in: ['Alice', 'Bob'] },
          'friends.posts.title': 'Hello World',
        },
      },
    },
  });

  // Multiple entity queries
  const multiresult = dummyQuery({
    users: {
      $: {
        where: {
          name: { $like: 'A%' },
        },
      },
    },
    posts: {
      $: {
        where: {
          title: { $like: '%tutorial%' },
        },
      },
    },
    comments: {
      $: {
        where: {
          body: { $like: '%helpful%' },
        },
      },
    },
  });

  // Edge cases and complex combinations
  dummyQuery({
    users: {
      $: {
        where: {
          and: [
            { name: { $like: 'A%' } },
            { email: { $not: 'somevalue' } },
            {
              or: [
                { bio: { $like: '%developer%' } },
                { bio: { $like: '%engineer%' } },
              ],
            },
          ],
        },
        fields: ['name', 'email', 'bio'],
      },
      posts: {
        $: {
          where: {
            title: { $like: '%tutorial%' },
          },
        },
        comments: {},
      },
      friends: {
        $: {
          where: {
            name: { $in: ['Alice', 'Bob', 'Charlie'] },
          },
        },
        posts: {},
      },
    },
  });

  // Test JSON field queries
  dummyQuery({
    users: {
      $: {
        where: {
          'stuff.custom': { $like: '%test%' },
        },
      },
    },
  });

  // Test any field queries
  dummyQuery({
    users: {
      $: {
        where: {
          junk: { $like: '%anything%' },
        },
      },
    },
  });

  // Test complex boolean logic
  dummyQuery({
    users: {
      $: {
        where: {
          and: [
            { name: { $like: 'A%' } },
            { email: { $not: 'somevalue' } },
            {
              or: [
                { bio: { $like: '%developer%' } },
                { bio: { $like: '%engineer%' } },
                { bio: { $like: '%architect%' } },
              ],
            },
          ],
        },
      },
    },
  });

  // Test nested boolean logic
  dummyQuery({
    users: {
      $: {
        where: {
          and: [
            {
              or: [{ name: { $like: 'A%' } }, { name: { $like: 'B%' } }],
            },
            {
              and: [
                { email: { $like: '%@gmail.com' } },
                { bio: { $not: 'somevalue' } },
              ],
            },
          ],
        },
      },
    },
  });

  // Test with all comparison operators
  dummyQuery({
    users: {
      $: {
        where: {
          'posts.title': { $gt: 'A', $lt: 'Z', $gte: 'B', $lte: 'Y' },
          'posts.body': { $like: '%content%', $ilike: '%CONTENT%' },
          name: { $not: 'admin' },
        },
      },
    },
  });

  // Test complex field selection with nested queries
  dummyQuery({
    users: {
      $: {
        fields: ['name', 'email'],
      },
      posts: {
        $: {
          fields: ['title'],
        },
        comments: {
          $: {
            fields: ['body'],
          },
        },
      },
    },
  });

  // Test mixed cardinality relationships
  dummyQuery({
    users: {
      posts: {
        author: {
          $: {
            fields: ['name', 'email'],
          },
        },
      },
      referrer: {
        $: {
          fields: ['name'],
        },
      },
      referred: {
        $: {
          fields: ['name'],
        },
      },
    },
  });

  // Test empty queries (should still be valid)
  dummyQuery({
    users: {},
  });

  dummyQuery({
    users: {
      posts: {},
    },
  });

  // Test queries with only fields
  const jslsldjfi = dummyQuery({
    users: {
      $: {
        fields: ['name', 'email'],
      },
    },
  });

  // Test queries with only nested queries
  const nestedResult = dummyQuery({
    users: {
      $: {
        fields: ['bio'],
      },
      posts: {
        $: {
          fields: ['title'],
        },
      },
    },
  });

  // Test complex combination of all features
  const sdijflsidf = dummyQuery({
    users: {
      $: {
        where: {
          and: [
            { name: { $like: 'A%' } },
            { email: { $not: 'somevalue' } },
            {
              or: [
                { bio: { $like: '%developer%' } },
                { bio: { $like: '%engineer%' } },
              ],
            },
          ],
        },
        fields: ['name', 'email', 'bio'],
      },
      posts: {
        $: {
          where: {
            title: { $like: '%tutorial%' },
          },
          fields: ['title'],
        },
        comments: {
          $: {
            where: {
              body: { $like: '%helpful%' },
            },
            fields: ['body'],
          },
        },
      },
      friends: {
        $: {
          where: {
            name: { $in: ['Alice', 'Bob', 'Charlie'] },
          },
          fields: ['name'],
        },
        posts: {
          $: {
            fields: ['title'],
          },
        },
      },
      referrer: {
        $: {
          fields: ['name', 'email'],
        },
      },
      referred: {
        $: {
          fields: ['name'],
        },
      },
    },
    posts: {
      $: {
        where: {
          title: { $like: '%important%' },
        },
        fields: ['title'],
      },
      author: {
        $: {
          fields: ['name'],
        },
      },
      comments: {
        $: {
          fields: ['body'],
        },
      },
    },
    comments: {
      $: {
        where: {
          body: { $like: '%great%' },
        },
        fields: ['body'],
      },
      post: {
        $: {
          fields: ['title'],
        },
      },
    },
  });
});

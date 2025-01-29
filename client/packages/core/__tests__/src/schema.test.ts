import { test } from 'vitest';

import { i } from '../../src';
import type { InstaQLQueryResult, InstaQLResult } from '../../src/queryTypes';

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
});

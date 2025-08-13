import { test } from 'vitest';

import { i } from '../../src';
import type {
  InstaQLParams,
  InstaQLResponse,
  InstaQLResult,
  ValidQuery,
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
        title: i.string().optional(),
        body: i.string(),
      }),
      comments: i.entity({
        body: i.string().indexed(),
        likes: i.number(),
      }),

      birthdays: i.entity({
        date: i.date(),
        message: i.string(),
        prizes: i.json<string | number>(),
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

  // NOTE: @ts-expect-error has been replaced with #ts-expect-error
  // after removing the Exactly type so that when these errors are ready to be checked again
  // search and replace can be used

  function dummyQuery<Q extends ValidQuery<Q, Schema>>(
    _query: Q,
  ): InstaQLResponse<Schema, Q> {
    return 1 as any;
  }

  // Where clause tests

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

  // strings allow matching against strings
  const validateDummyQueries = () => {
    // Allow for matching id
    const r0 = dummyQuery({
      users: {
        $: {
          where: {
            id: '123',
          },
        },
      },
    });

    const r1 = dummyQuery({
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

    const r1b = dummyQuery({
      users: {
        $: {
          where: {
            // @ts-expect-error
            name: 289,
            email: {
              // @ts-expect-error
              $like: 8932,
            },
          },
        },
      },
    });

    const r2 = dummyQuery({
      posts: {
        $: {
          // @ts-expect-error valid
          where: {
            // not yet able to infer if dot syntax is used
            'author.stuff.custom': { $gt: 89032 },
          },
        },
      },
    });

    const r2b = dummyQuery({
      posts: {
        $: {
          // @ts-expect-error
          where: {
            'author.stuff.custom': { doesnotexist: 932 },
          },
        },
      },
    });

    // Multi queries
    const r3 = dummyQuery({
      users: {
        $: {
          where: {
            name: 'John',
          },
        },
      },
      comments: {
        $: {
          where: {
            // @ts-expect-error
            body: { gt: true },
          },
        },
      },
    });

    // Can't use $like or $ilike on cols that are not strings
    const r4b = dummyQuery({
      comments: {
        $: {
          where: {
            // @ts-expect-error
            likes: { $like: true },
          },
        },
      },
    });

    // Field selection
    const r5 = dummyQuery({
      comments: {
        $: {
          fields: ['body'],
        },
      },
    });

    const r5b = dummyQuery({
      comments: {
        $: {
          // @ts-expect-error
          fields: ['eail', 'bo'],
        },
      },
    });

    const r5b2 = dummyQuery({
      comments: {
        $: {
          fields: ['body'],
        },
      },
    });

    type R5b2 = typeof r5b2;
    // @ts-expect-error Can't access fields that were not specifically picked
    console.log(r5b2.comments[0].likes);

    // Does not allow (non-dotted) fields that don't match table shape
    const r6 = dummyQuery({
      posts: {
        $: {
          // @ts-expect-error
          where: {
            jo8josiefo: 8932,
          },
        },
      },
    });

    // Only allow $isNull for optional fields
    const r7 = dummyQuery({
      posts: {
        $: {
          where: {
            title: { $isNull: true },
          },
        },
      },
    });

    const r7b = dummyQuery({
      posts: {
        $: {
          where: {
            // @ts-expect-error Body is a required field
            body: { $isNull: true },
          },
        },
      },
    });

    // $in
    const r8 = dummyQuery({
      posts: {
        $: {
          where: {
            title: { $in: ['1st title option', '2nd title option'] },
          },
        },
      },
    });
    const r8b = dummyQuery({
      posts: {
        $: {
          where: {
            // @ts-expect-error
            title: { $in: [123, 345, 789] },
          },
        },
      },
    });

    // AND
    const r9 = dummyQuery({
      posts: {
        $: {
          where: {
            and: [{ title: 'MyTitle' }, { body: { $like: '%hasthisinit%' } }],
          },
        },
      },
    });

    const r9b = dummyQuery({
      posts: {
        $: {
          where: {
            and: [
              // @ts-expect-error
              { invalidKey: 'MyTitle' },
              // @ts-expect-error
              { body: { $like: '%hasthisinit%' } },
            ],
          },
        },
      },
    });

    // OR
    const r10 = dummyQuery({
      posts: {
        $: {
          where: {
            or: [{ title: 'MyTitle' }, { body: { $like: '%hasthisinit%' } }],
          },
        },
      },
    });
    const r10b = dummyQuery({
      posts: {
        $: {
          where: {
            or: [
              // @ts-expect-error
              { invalidKey: 'MyTitle' },
              // @ts-expect-error because of first error
              { body: { $like: '%hasthisinit%' } },
            ],
          },
        },
      },
    });

    // $not
    const r11 = dummyQuery({
      posts: {
        $: {
          where: {
            body: {
              $not: 'notthisbody',
            },
          },
        },
      },
    });
    const r11b = dummyQuery({
      posts: {
        $: {
          where: {
            body: {
              // @ts-expect-error can't check if string *isn't* number (always false)
              $not: 8932,
            },
          },
        },
      },
    });

    // nested query field selection
    const r12 = dummyQuery({
      //  ^? Comments only includes: body and id (id always required)
      posts: {
        comments: {
          $: {
            fields: ['body'],
          },
        },
      },
    });

    // nested query where
    const r13 = dummyQuery({
      //  ^? Comments only includes: body and id (id always required)
      posts: {
        comments: {
          $: {
            where: {
              body: { $like: '%helpful%' },
            },
          },
        },
      },
    });

    const r13b = dummyQuery({
      //  ^? Comments only includes: body and id (id always required)
      posts: {
        comments: {
          $: {
            where: {
              // @ts-expect-error nested where check can't compare string to number
              body: 8939288,
            },
          },
        },
      },
    });

    // Relations
    const r14 = dummyQuery({
      users: {
        referred: {
          $: {
            where: {
              bio: 'hi',
            },
          },
        },
      },
    });

    const r14b = dummyQuery({
      users: {
        referred: {
          $: {
            // @ts-expect-error
            where: {
              invalidcol: 'hi',
            },
          },
        },
      },
    });

    const r14b2 = dummyQuery({
      users: {
        referred: {
          $: {
            // @ts-expect-error
            where: {
              invalidcol: {
                $not: '839',
              },
            },
          },
        },
      },
    });

    // Deep relations
    const r15 = dummyQuery({
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
          },
        },
      },
    });
    const r15b = dummyQuery({
      users: {
        friends: {
          posts: {
            author: {
              $: {
                where: {
                  // @ts-expect-error
                  name: 8392,
                },
              },
            },
          },
        },
      },
    });

    // And and or
    const r16 = dummyQuery({
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
          fields: ['name'],
        },
      },
    });
    const r16b = dummyQuery({
      users: {
        $: {
          where: {
            and: [
              { name: { $like: 'A%' } },
              {
                or: [
                  // @ts-expect-error
                  { email: { $like: 8932 } },
                  // @ts-expect-error
                  { email: { $isNull: true } },
                ],
              },
            ],
          },
          fields: ['name'],
        },
      },
    });

    // Test empty queries (should still be valid)
    const r17 = dummyQuery({
      users: {},
    });

    // Mixed cardinality relationships
    const r18 = dummyQuery({
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

    // ilike in relations
    const r19 = dummyQuery({
      comments: {
        $: {
          where: {
            // @ts-expect-error
            'post.body': { $ilike: 'hi' },
          },
        },
      },
    });

    const r20 = dummyQuery({
      comments: {
        $: {
          where: {
            body: { $ilike: 'hi' },
          },
        },
      },

      posts: {
        $: {
          where: {
            // @ts-expect-error String fields that aren't indexed can't use $ilike
            body: { $ilike: 'hi' },
          },
        },
      },
    });

    // Json columns
    const r21 = dummyQuery({
      birthdays: {
        $: {
          where: {
            prizes: 'hi',
          },
        },
      },
    });

    const flip = false;
    const testWhereClause = flip ? { prizes: 'hi' } : undefined;
    const r22 = dummyQuery({
      birthdays: {
        $: {
          where: testWhereClause,
        },
      },
    });
  };
});

import { i } from '../../src/schema';
import { validateQuery } from '../../src/queryValidation.ts';
import { expect, test, vi } from 'vitest';
import { id, InstantSchemaDef } from '../../src';

const testSchema = i.schema({
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
      title: i.string().indexed(),
      body: i.string(),
    }),
    comments: i.entity({
      body: i.string(),
    }),

    unlinkedWithAnything: i.entity({
      animal: i.string(),
      count: i.string(),
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

const beValid = (
  q: unknown,
  schema: InstantSchemaDef<any, any, any> | null = testSchema,
) => {
  expect(() => validateQuery(q, schema ?? undefined)).not.toThrow();
  if (schema) {
    expect(() => validateQuery(q, undefined)).not.toThrow();
  }
};

const beWrong = (
  q: unknown,
  schema: InstantSchemaDef<any, any, any> | null = testSchema,
) => {
  expect(() => validateQuery(q, schema ?? undefined)).toThrow();
};

test('validates top level types', () => {
  beValid({});
  beWrong('Testing');
  beWrong(8392);
  beWrong([]);
});

test('top level entitiy names', () => {
  beValid({
    posts: {},
  });

  beWrong({
    users: {},
    notInSchema: {},
  });

  beValid({
    users: {},
    posts: {},
  });

  beValid(
    {
      somethingsuperRandomButNoSchema: {},
    },
    null,
  );

  beWrong({ posts: [] });
});

test('links', () => {
  beValid({
    posts: {
      comments: {},
    },
  });

  beWrong({
    posts: {
      doesNotExist: {},
    },
  });

  beWrong({
    posts: {
      unlinkedWithAnything: {},
    },
  });

  beValid({
    posts: {
      comments: {},
    },
  });
});

test('dollar sign object', () => {
  beWrong({
    posts: {
      $where: {
        title: 'Drew',
      },
    },
  });
  beValid({
    posts: {
      $: {
        where: {
          title: 'Drew',
        },
      },
    },
  });
  beWrong({
    posts: {
      $: {
        badKey: {
          title: 'Drew',
        },
      },
    },
  });
});

test('all valid dollar sign keys', () => {
  beValid({
    posts: {
      $: {
        where: { title: 'test' },
        order: { title: 'asc' },
        limit: 10,
        last: 5,
        first: 3,
        offset: 2,
        after: ['cursor', 'data', 'value', 1],
        before: ['cursor', 'data', 'value', 2],
        fields: ['title', 'body'],
      },
    },
  });

  beWrong({
    posts: {
      $: {
        notARealFilter: 10,
      },
    },
  });

  beWrong({
    posts: {
      notARealFilter: 10,
      $: {},
    },
  });

  beValid({
    posts: {
      comments: {
        $: {
          where: {
            body: 'test',
          },
        },
      },
    },
  });

  beWrong({
    posts: {
      comments: {
        $: {
          notARealFilter: 'hi',
        },
      },
    },
  });
});

test('where clause type validation', () => {
  // Valid string values
  beValid({
    users: {
      $: {
        where: {
          name: 'John',
          email: 'john@example.com',
        },
      },
    },
  });

  // Invalid string values
  beWrong({
    users: {
      $: {
        where: {
          name: 123,
        },
      },
    },
  });

  beWrong({
    users: {
      $: {
        where: {
          email: true,
        },
      },
    },
  });

  // Valid any type (junk field)
  beValid({
    users: {
      $: {
        where: {
          junk: 'string',
        },
      },
    },
  });

  beValid({
    users: {
      $: {
        where: {
          junk: 123,
        },
      },
    },
  });

  beValid({
    users: {
      $: {
        where: {
          junk: { complex: 'object' },
        },
      },
    },
  });
});

test('where clause operators', () => {
  // Valid $in operator
  beValid({
    users: {
      $: {
        where: {
          name: { $in: ['John', 'Jane'] },
        },
      },
    },
  });

  // Valid 'in' operator (without $)
  beValid({
    users: {
      $: {
        where: {
          name: { in: ['John', 'Jane'] },
        },
      },
    },
  });

  // Invalid $in operator - not an array
  beWrong({
    users: {
      $: {
        where: {
          name: { $in: 'John' },
        },
      },
    },
  });

  // Invalid 'in' operator - not an array
  beWrong({
    users: {
      $: {
        where: {
          name: { in: 'John' },
        },
      },
    },
  });

  // Invalid $in operator - wrong type in array
  beWrong({
    users: {
      $: {
        where: {
          name: { $in: ['John', 123] },
        },
      },
    },
  });

  // Invalid 'in' operator - wrong type in array
  beWrong({
    users: {
      $: {
        where: {
          name: { in: ['John', 123] },
        },
      },
    },
  });

  // Any 'in' field is valid without schema
  beValid(
    {
      users: {
        $: {
          where: {
            name: { in: ['John', 123] },
          },
        },
      },
    },
    null,
  );

  // Valid comparison operators
  beValid({
    posts: {
      $: {
        where: {
          title: { $not: 'Draft' },
        },
      },
    },
  });

  // Valid $ne operator (alias for $not)
  beValid({
    posts: {
      $: {
        where: {
          title: { $ne: 'Draft' },
        },
      },
    },
  });

  // Valid $gt, $lt, $gte, $lte operators
  beValid({
    posts: {
      $: {
        where: {
          title: { $gt: 'A' },
        },
      },
    },
  });

  beValid({
    posts: {
      $: {
        where: {
          title: { $lt: 'Z' },
        },
      },
    },
  });

  beValid({
    posts: {
      $: {
        where: {
          title: { $gte: 'A' },
        },
      },
    },
  });

  beValid({
    posts: {
      $: {
        where: {
          title: { $lte: 'Z' },
        },
      },
    },
  });

  // Valid $like operator on string
  beValid({
    users: {
      $: {
        where: {
          name: { $like: '%John%' },
        },
      },
    },
  });

  // Invalid $like operator on non-string
  beWrong({
    posts: {
      $: {
        where: {
          title: { $like: 123 },
        },
      },
    },
  });

  // Valid $ilike operator on string
  beWrong({
    users: {
      $: {
        where: {
          name: { $ilike: '%john%' },
        },
      },
    },
  });

  // Invalid $ilike operator on non-string
  beWrong({
    posts: {
      $: {
        where: {
          title: { $ilike: 123 },
        },
      },
    },
  });

  // Invalid $isNull value type
  beWrong({
    users: {
      $: {
        where: {
          bio: { $isNull: 'true' },
        },
      },
    },
  });
});

test('where clause unknown operators', () => {
  beWrong({
    users: {
      $: {
        where: {
          name: { $unknownOperator: 'value' },
        },
      },
    },
  });
});

test('where clause unknown attributes', () => {
  beWrong({
    users: {
      $: {
        where: {
          unknownAttribute: 'value',
        },
      },
    },
  });
});

test('where clause id validation', () => {
  // Valid id
  beValid({
    users: {
      $: {
        where: {
          id: 'user-123',
        },
      },
    },
  });

  // Invalid id type
  beWrong({
    users: {
      $: {
        where: {
          id: 123,
        },
      },
    },
  });

  // Valid id with operators
  beValid({
    users: {
      $: {
        where: {
          id: { $in: ['user-1', 'user-2'] },
        },
      },
    },
  });
});

test('where clause logical operators', () => {
  // Valid or clause
  beValid({
    users: {
      $: {
        where: {
          or: [{ name: 'John' }, { email: 'jane@example.com' }],
        },
      },
    },
  });

  // Valid and clause
  beValid({
    users: {
      $: {
        where: {
          and: [{ name: 'John' }, { bio: { $isNull: false } }],
        },
      },
    },
  });

  // Invalid nested clause
  beWrong({
    users: {
      $: {
        where: {
          or: [{ name: 123 }],
        },
      },
    },
  });
});

test('where clause dot notation validation', () => {
  // Valid dot notation - users.posts.title
  beValid({
    users: {
      $: {
        where: {
          'posts.title': 'Some Title',
        },
      },
    },
  });

  // Valid dot notation - posts.author.name
  beValid({
    posts: {
      $: {
        where: {
          'author.name': 'John Doe',
        },
      },
    },
  });

  // Valid dot notation - users.posts.comments.body
  beValid({
    users: {
      $: {
        where: {
          'posts.comments.body': 'Great comment!',
        },
      },
    },
  });

  // Valid dot notation with operators
  beValid({
    users: {
      $: {
        where: {
          'posts.title': { $like: '%tutorial%' },
        },
      },
    },
  });

  // Valid dot notation with $ilike operator
  beValid({
    users: {
      $: {
        where: {
          'posts.title': { $ilike: '%TUTORIAL%' },
        },
      },
    },
  });

  // Valid dot notation - self-referential link (users.friends.name)
  beValid({
    users: {
      $: {
        where: {
          'friends.name': 'Friend Name',
        },
      },
    },
  });

  // Invalid dot notation - nonexistent link
  beWrong({
    users: {
      $: {
        where: {
          'invalidLink.title': 'value',
        },
      },
    },
  });

  // Invalid dot notation - nonexistent attribute
  beWrong({
    users: {
      $: {
        where: {
          'posts.nonexistent': 'value',
        },
      },
    },
  });

  // Invalid dot notation - no link between entities
  beWrong({
    users: {
      $: {
        where: {
          'unlinkedWithAnything.animal': 'cat',
        },
      },
    },
  });

  // Invalid dot notation - wrong type
  beWrong({
    users: {
      $: {
        where: {
          'posts.title': 123,
        },
      },
    },
  });

  // Invalid dot notation - using string operator on non-string
  beWrong({
    posts: {
      $: {
        where: {
          'author.name': { $like: 123 },
        },
      },
    },
  });

  // Invalid dot notation - using $ilike with wrong type
  beWrong({
    posts: {
      $: {
        where: {
          'author.name': { $ilike: 123 },
        },
      },
    },
  });

  // Valid dot notation with $in operator
  beValid({
    users: {
      $: {
        where: {
          'posts.title': { $in: ['Title 1', 'Title 2'] },
        },
      },
    },
  });

  // Invalid dot notation with $in operator - wrong type in array
  beWrong({
    users: {
      $: {
        where: {
          'posts.title': { $in: ['Title 1', 123] },
        },
      },
    },
  });

  // Valid dot notation with id field
  beValid({
    users: {
      $: {
        where: {
          'posts.id': id(),
        },
      },
    },
  });

  // Valid dot notation with optional field and $isNull
  beValid({
    posts: {
      $: {
        where: {
          'author.bio': { $isNull: true },
        },
      },
    },
  });

  // Don't need final attributes
  beValid({
    comments: { $: { where: { post: id() } } },
  });

  beWrong({
    comments: { $: { where: { post: 'not-a-uuid' } } },
  });

  beValid({
    users: { $: { where: { 'posts.comments': id() } } },
  });

  beWrong({
    users: { $: { where: { 'posts.comments': 'not-a-uuid' } } },
  });
});

test('pagination parameters can only be used at top-level namespaces', () => {
  const cursor = ['cursor', 'data', 'value', 1];

  beValid({
    posts: {
      $: {
        limit: 10,
      },
    },
  });

  beValid({
    posts: {
      $: {
        offset: 20,
      },
    },
  });

  beValid({
    posts: {
      $: {
        before: cursor,
      },
    },
  });

  beValid({
    posts: {
      $: {
        after: cursor,
      },
    },
  });

  beValid({
    posts: {
      $: {
        first: 5,
      },
    },
  });

  beValid({
    posts: {
      $: {
        last: 5,
      },
    },
  });

  // Valid - multiple pagination params at top-level
  beValid({
    users: {
      $: {
        limit: 5,
        offset: 10,
      },
      posts: {
        $: {
          where: { title: 'Test' },
        },
      },
    },
  });

  beWrong({
    users: {
      posts: {
        $: {
          offset: 10,
        },
      },
    },
  });

  beWrong({
    users: {
      posts: {
        $: {
          before: cursor,
        },
      },
    },
  });

  beWrong({
    users: {
      posts: {
        $: {
          after: cursor,
        },
      },
    },
  });

  beWrong({
    users: {
      posts: {
        $: {
          first: 5,
        },
      },
    },
  });

  beWrong({
    users: {
      posts: {
        $: {
          last: 5,
        },
      },
    },
  });

  // Invalid - multiple pagination params in deeply nested namespace
  beWrong({
    users: {
      posts: {
        comments: {
          $: {
            limit: 5,
            offset: 10,
            first: 3,
          },
        },
      },
    },
  });

  // Valid - multiple top-level entities with different pagination params
  beValid({
    posts: {
      $: {
        limit: 10,
        offset: 5,
      },
    },
    users: {
      $: {
        first: 20,
        after: cursor,
      },
    },
  });
});

test('relations with complex objects', () => {
  beValid({
    users: {
      $: {
        where: {
          posts: {
            $isNull: true,
          },
        },
      },
    },
  });

  beValid({
    users: {
      $: {
        where: {
          posts: {
            $not: 'this',
          },
        },
      },
    },
  });

  beValid({
    users: {
      $: {
        where: {
          or: [
            {
              posts: {
                $not: 'this',
              },
            },
          ],
        },
      },
    },
  });

  beWrong({
    users: {
      $: {
        where: {
          posts: ' Invalid equality check',
        },
      },
    },
  });
});

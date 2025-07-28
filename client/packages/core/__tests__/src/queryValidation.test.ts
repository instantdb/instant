import { i } from '../../src/schema';
import { validateQuery } from '../../src/queryValidation.ts';
import { expect, test } from 'vitest';
import { InstantSchemaDef } from '../../src';

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
      title: i.string(),
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

test('comparison', () => {});

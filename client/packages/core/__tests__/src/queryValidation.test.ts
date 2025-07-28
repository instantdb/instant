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
  schema: InstantSchemaDef<any, any, any> = testSchema,
) => {
  const result = validateQuery(q, schema);
  expect(
    result,
    `Query: ${JSON.stringify(q)}, returned ${result}, should be valid`,
  ).toStrictEqual({
    status: 'success',
  });
};

const beWrong = (
  q: unknown,
  schema: InstantSchemaDef<any, any, any> = testSchema,
) => {
  const result = validateQuery(q, schema);
  expect(
    result.status,
    `Expected query to be invalid: ${JSON.stringify(q)}`,
  ).toBe('error');
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
});

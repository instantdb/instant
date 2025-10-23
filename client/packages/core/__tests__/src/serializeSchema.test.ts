import { expect, test } from 'vitest';
import { i } from '../../src/schema';
import { parseSchemaFromJSON } from '../../src/parseSchemaFromJSON';
import { InstantSchemaDef } from '../../src/schemaTypes';

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
  rooms: {
    chat: {
      presence: i.entity({
        name: i.string(),
        status: i.string(),
      }),
      topics: {
        sendEmoji: i.entity({
          emoji: i.string(),
        }),
      },
    },
  },
});

type AnySchema = InstantSchemaDef<any, any, any>;

// compare schemas by stringifying them with json and comparing the strings
const compareSchemas = (schema1: AnySchema, schema2: AnySchema) => {
  expect(JSON.stringify(schema1, null, 2)).toBe(
    JSON.stringify(schema2, null, 2),
  );
};

test('ability to parse stringified schema into real schema object', () => {
  const stringified = JSON.stringify(schema, null, 2);
  const parsed = JSON.parse(stringified);
  console.log(stringified);

  const otherSide = parseSchemaFromJSON(parsed);

  compareSchemas(schema, otherSide);

  expect(schema.entities.comments.links).toEqual(
    otherSide.entities.comments.links,
  );
  expect(schema.entities.comments.asType).toEqual(
    otherSide.entities.comments.asType,
  );

  expect(schema).toStrictEqual(otherSide);
});

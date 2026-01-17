import { i } from '@instantdb/core';
import { test, expect } from 'vitest';
import { generateSchemaTypescriptFile } from '../../src/schema';
import { schemaTypescriptFileToInstantSchema } from '../../src/typescript-schema';
import prettier from '@prettier/sync';

test('roundtrips schema', () => {
  const originalCode = generateSchemaTypescriptFile(
    schema,
    schema,
    '@instantdb/core',
  );
  const extractedSchema = schemaTypescriptFileToInstantSchema(originalCode);
  expect(extractedSchema).toEqual(schema);
  expect(generateSchemaTypescriptFile(null, schema, '@instantdb/core')).toEqual(
    generateSchemaTypescriptFile(null, extractedSchema, '@instantdb/core'),
  );
});

function format(code: string): string {
  return prettier.format(code, { parser: 'typescript' });
}

test('roundtrips schema with prettier-ed code', () => {
  const originalCode = format(
    generateSchemaTypescriptFile(schema, schema, '@instantdb/core'),
  );

  const extractedSchema = schemaTypescriptFileToInstantSchema(originalCode);
  expect(extractedSchema).toEqual(schema);
  expect(
    format(generateSchemaTypescriptFile(null, schema, '@instantdb/core')),
  ).toEqual(
    format(
      generateSchemaTypescriptFile(null, extractedSchema, '@instantdb/core'),
    ),
  );
});

const schema = i.schema({
  entities: {
    $files: i.entity({
      metadata: i.any().optional(),
      path: i.string().unique().indexed().optional(),
      url: i.any().optional(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    books: i.entity({
      description: i.string().optional(),
      isbn13: i.string().unique().optional(),
      pageCount: i.number().indexed().optional(),
      thumbnail: i.any().optional(),
      title: i.string().indexed(),
    }),
    bookshelves: i.entity({
      desc: i.string().optional(),
      name: i.any().optional(),
      order: i.number().indexed().optional(),
    }),
    onlyId: i.entity({}),
    users: i.entity({
      createdAt: i.date().optional(),
      email: i.string().unique().indexed().optional(),
      fullName: i.string().optional(),
      handle: i.string().unique().indexed().optional(),
    }),
    'key-as-string': i.entity({
      prop: i.string().unique(),
    }),
  },
  links: {
    bookshelvesBooks: {
      forward: {
        on: 'bookshelves',
        has: 'many',
        label: 'books',
      },
      reverse: {
        on: 'books',
        has: 'many',
        label: 'bookshelves',
      },
    },
    usersBookshelves: {
      forward: {
        on: 'users',
        has: 'many',
        label: 'bookshelves',
      },
      reverse: {
        on: 'bookshelves',
        has: 'many',
        label: 'users',
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
        'send-emoji': i.entity({
          emoji: i.string(),
        }),
      },
    },
    noTopics: {
      presence: i.entity({ name: i.string() }),
    },
  },
});

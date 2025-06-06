import { test, expect } from 'vitest';

import { generateSchemaTypescriptFile } from '../../src/schema';
import { apiSchemaToInstantSchemaDef } from '../../src/api';
import { i } from '@instantdb/core';

test('generates schema', () => {
  expect(
    generateSchemaTypescriptFile(
      i.schema({
        entities: {},
        links: {},
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
      }),
      apiSchemaToInstantSchemaDef({
        refs: {
          '["bookshelves" "books" "books" "bookshelves"]': {
            'required?': false,
            'forward-identity': [
              '7cac656d-1a61-4dba-a6ae-1ff9743eba42',
              'bookshelves',
              'books',
            ],
            id: '7bcf952d-5ef3-4420-96b3-91cd0f7edf3d',
            'unique?': false,
            'reverse-identity': [
              '146c2c55-5b9e-446f-af28-f4ae073f7649',
              'books',
              'bookshelves',
            ],
            cardinality: 'many',
            'inferred-types': ['string'],
            'value-type': 'ref',
            catalog: 'user',
            'index?': false,
          },
          '["users" "bookshelves" "bookshelves" "users"]': {
            'required?': false,
            'forward-identity': [
              'b1c2d516-537b-4690-b916-a24b458644a0',
              'users',
              'bookshelves',
            ],
            id: '594a5de7-6a0a-495b-bda0-e827ec615ad1',
            'unique?': false,
            'reverse-identity': [
              '2264cc39-7fb6-4380-b792-14673b97f49a',
              'bookshelves',
              'users',
            ],
            cardinality: 'many',
            'inferred-types': ['string'],
            'value-type': 'ref',
            catalog: 'user',
            'index?': false,
          },
        },
        blobs: {
          onlyId: {
            id: {
              'required?': false,
              'forward-identity': [
                '9203a9d8-b345-47d7-8caf-b800101bc814',
                'books',
                'id',
              ],
              id: '54f72bd0-aa44-4b3f-a8d7-d55cf45e72d4',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': true,
            },
          },
          books: {
            description: {
              'required?': false,
              'forward-identity': [
                'bdd54bf2-3164-4276-b88e-7a591a293a3a',
                'books',
                'description',
              ],
              'checked-data-type': 'string',
              id: '67d842b3-1b0d-4ed8-bc76-1159cdcc2de7',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': false,
            },
            isbn13: {
              'required?': false,
              'forward-identity': [
                '599e2d78-f98e-4e1e-9d6a-fc8b9002175c',
                'books',
                'isbn13',
              ],
              'checked-data-type': 'string',
              id: 'dd057834-64b3-4de5-83b7-2317f85d4b6c',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': false,
            },
            thumbnail: {
              'required?': false,
              'forward-identity': [
                'ec34c904-e1e5-4dd9-b36a-fceb331c1220',
                'books',
                'thumbnail',
              ],
              id: '2cd3fc20-e88a-4cd2-b570-473171ae568f',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': null,
              'value-type': 'blob',
              catalog: 'user',
              'index?': false,
            },
            pageCount: {
              'required?': false,
              'forward-identity': [
                '79d29b20-8289-4f9e-98c6-35e27c884bdb',
                'books',
                'pageCount',
              ],
              'checked-data-type': 'number',
              id: '887b5918-83d4-47ab-a6c0-bf164f0d2d8e',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['number'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': true,
            },
            title: {
              'required?': true,
              'forward-identity': [
                'c0afd326-3458-405c-b746-bb834150cbd9',
                'books',
                'title',
              ],
              'checked-data-type': 'string',
              id: '8612b643-f047-44da-83b9-15592aa5ff49',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': true,
            },
            id: {
              'required?': false,
              'forward-identity': [
                '9203a9d8-b345-47d7-8caf-b800101bc814',
                'books',
                'id',
              ],
              id: '54f72bd0-aa44-4b3f-a8d7-d55cf45e72d4',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': true,
            },
          },
          users: {
            createdAt: {
              'required?': false,
              'forward-identity': [
                'cb2fd71f-8915-418b-8f23-526258513c15',
                'users',
                'createdAt',
              ],
              'checked-data-type': 'date',
              id: 'eb3e9039-16ac-41cc-899d-6751e570d95a',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': false,
            },
            email: {
              'required?': false,
              'forward-identity': [
                'da2b8042-20c7-4697-8109-f2f579d59238',
                'users',
                'email',
              ],
              'checked-data-type': 'string',
              id: 'be040afa-e9d0-4712-b5f1-2bb86575d73a',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': true,
            },
            handle: {
              'required?': false,
              'forward-identity': [
                'baac2641-baa6-4a13-9918-1d29424fd1ca',
                'users',
                'handle',
              ],
              'checked-data-type': 'string',
              id: '25ca5693-e7be-4bf9-87cf-b7888e81dc8c',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': true,
            },
            fullName: {
              'required?': false,
              'forward-identity': [
                '47005d89-d06a-4dc6-a704-a7e6406b06a1',
                'users',
                'fullName',
              ],
              'checked-data-type': 'string',
              id: 'f566dc1c-c66c-4390-8ae8-1ae2fe344e8c',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': false,
            },
            id: {
              'required?': false,
              'forward-identity': [
                '49b46336-fb7d-4e22-9a89-4b7306bcda5b',
                'users',
                'id',
              ],
              id: '2a08a19e-a159-46dc-9429-f4797bd205f1',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': true,
            },
          },
          bookshelves: {
            name: {
              'required?': false,
              'forward-identity': [
                '09eb72cd-7f27-4ebc-beed-2e07c0c5efc0',
                'bookshelves',
                'name',
              ],
              id: 'aedb622f-ae60-4ce5-bfc2-b726d9277bd1',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['number', 'string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': false,
            },
            order: {
              'required?': false,
              'forward-identity': [
                '0d3e13c8-91ca-4178-80c2-ea6593c8b70a',
                'bookshelves',
                'order',
              ],
              'checked-data-type': 'number',
              id: '713b42f6-44b1-4aab-8a4f-742b27726848',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['number'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': true,
            },
            id: {
              'required?': false,
              'forward-identity': [
                '9f982123-eee6-4bd0-9d95-dafc36d3a62c',
                'bookshelves',
                'id',
              ],
              id: '2e63fd1c-6920-474b-bd49-37dd9bcf805e',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': true,
            },
            desc: {
              'required?': false,
              'forward-identity': [
                'cbe3af21-ad0d-4d70-97a1-83093fd58665',
                'bookshelves',
                'desc',
              ],
              id: 'cb3bd3b7-75be-47eb-b761-cca81d637798',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'user',
              'index?': false,
            },
          },
          $files: {
            id: {
              'required?': false,
              'forward-identity': [
                '96653231-03ff-ffff-2a34-81ffffffffff',
                '$files',
                'id',
              ],
              id: '96653230-13ff-ffff-2a34-81ffffffffff',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'system',
              'index?': true,
            },
            path: {
              'required?': false,
              'forward-identity': [
                '96653231-03ff-ffff-2a34-f04cffffffff',
                '$files',
                'path',
              ],
              'checked-data-type': 'string',
              id: '96653230-13ff-ffff-2a34-f04cffffffff',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'system',
              'index?': true,
            },
            url: {
              'required?': false,
              'forward-identity': [
                '96653231-03ff-ffff-2a35-48afffffffff',
                '$files',
                'url',
              ],
              id: '96653230-13ff-ffff-2a35-48afffffffff',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'system',
              'index?': false,
            },
            metadata: {
              'required?': false,
              'forward-identity': [
                '96653231-03ff-ffff-2a34-c24c0304c1ff',
                '$files',
                'metadata',
              ],
              id: '96653230-13ff-ffff-2a34-c24c0304c1ff',
              'unique?': false,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'system',
              'index?': false,
            },
          },
          $users: {
            id: {
              'required?': false,
              'forward-identity': [
                '96653231-03ff-ffff-a4b4-81ffffffffff',
                '$users',
                'id',
              ],
              id: '96653230-13ff-ffff-a4b4-81ffffffffff',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'system',
              'index?': true,
            },
            email: {
              'required?': false,
              'forward-identity': [
                '96653231-03ff-ffff-a4b4-46010bffffff',
                '$users',
                'email',
              ],
              'checked-data-type': 'string',
              id: '96653230-13ff-ffff-a4b4-46010bffffff',
              'unique?': true,
              cardinality: 'one',
              'inferred-types': ['string'],
              'value-type': 'blob',
              catalog: 'system',
              'index?': true,
            },
          },
        },
      }),
      '@instantdb/core',
    ),
  ).toEqual(`// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/core";

const _schema = i.schema({
  // We inferred 1 attribute!
  // Take a look at this schema, and if everything looks good,
  // run \`push schema\` again to enforce the types.
  entities: {
    "$files": i.entity({
      "metadata": i.any().optional(),
      "path": i.string().unique().indexed().optional(),
      "url": i.any().optional(),
    }),
    "$users": i.entity({
      "email": i.string().unique().indexed().optional(),
    }),
    "books": i.entity({
      "description": i.string().optional(),
      "isbn13": i.string().unique().optional(),
      "pageCount": i.number().indexed().optional(),
      "thumbnail": i.any().optional(),
      "title": i.string().indexed(),
    }),
    "bookshelves": i.entity({
      "desc": i.string().optional(),
      "name": i.any().optional(),
      "order": i.number().indexed().optional(),
    }),
    "onlyId": i.entity({}),
    "users": i.entity({
      "createdAt": i.date().optional(),
      "email": i.string().unique().indexed().optional(),
      "fullName": i.string().optional(),
      "handle": i.string().unique().indexed().optional(),
    }),
  },
  links: {
    "bookshelvesBooks": {
      "forward": {
        "on": "bookshelves",
        "has": "many",
        "label": "books"
      },
      "reverse": {
        "on": "books",
        "has": "many",
        "label": "bookshelves"
      }
    },
    "usersBookshelves": {
      "forward": {
        "on": "users",
        "has": "many",
        "label": "bookshelves"
      },
      "reverse": {
        "on": "bookshelves",
        "has": "many",
        "label": "users"
      }
    }
  },
  rooms: {
    "chat": {
      "presence": i.entity({
        "name": i.string(),
        "status": i.string(),
      }),
      "topics": {
        "sendEmoji": i.entity({
          "emoji": i.string(),
        }),
      }
    },
  }
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema }
export default schema;
`);
});

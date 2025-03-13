// Docs: https://www.instantdb.com/docs/modeling-data

import { i, InstaQLEntity } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    ratings: i.entity({
      // Indexing so we can easily find all ratings for a page
      pageId: i.string().indexed(),
      localId: i.string(),
      // We'll use a unique key to make sure that a user
      // can only rate a particular page once.
      key: i.string().unique(),
      wasHelpful: i.boolean(),
      extraComment: i.string(),
    }),
  },
  links: {},
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

type Rating = InstaQLEntity<AppSchema, 'ratings'>;

export type { AppSchema, Rating };

export default schema;

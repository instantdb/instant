// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    $files: i.entity({
      email: i.string().optional(),
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      fullName: i.string(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
  },
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: '$users',
        has: 'one',
        label: 'linkedPrimaryUser',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'linkedGuestUsers',
      },
    },
  },
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

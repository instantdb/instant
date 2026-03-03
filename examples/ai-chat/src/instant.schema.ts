// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/react';

const _schema = i.schema({
  // We inferred 1 attribute!
  // Take a look at this schema, and if everything looks good,
  // run `push schema` again to enforce the types.
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $streams: i.entity({
      abortReason: i.string().optional(),
      clientId: i.string().unique().indexed(),
      done: i.boolean().optional(),
      size: i.number().optional(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    chats: i.entity({
      title: i.string().optional(),
    }),
    messages: i.entity({
      metadata: i.any().optional(),
      parts: i.json().optional(),
      role: i.string(),
    }),
  },
  links: {
    $streams$files: {
      forward: {
        on: '$streams',
        has: 'many',
        label: '$files',
      },
      reverse: {
        on: '$files',
        has: 'one',
        label: '$stream',
        onDelete: 'cascade',
      },
    },
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
    chatsMessages: {
      forward: {
        on: 'chats',
        has: 'many',
        label: 'messages',
      },
      reverse: {
        on: 'messages',
        has: 'one',
        label: 'chat',
      },
    },
    chatsOwner: {
      forward: {
        on: 'chats',
        has: 'one',
        label: 'owner',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'chats',
      },
    },
    chatsStream: {
      forward: {
        on: 'chats',
        has: 'one',
        label: 'stream',
      },
      reverse: {
        on: '$streams',
        has: 'one',
        label: 'chat',
      },
    },
  },
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

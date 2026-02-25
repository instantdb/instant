// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/react';

const _schema = i.schema({
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
      createdAt: i.number().indexed(),
      matchedPrompt: i.string().optional(),
      modelId: i.string().optional(),
    }),
    messages: i.entity({
      createdAt: i.number().indexed(),
      order: i.number(),
      parts: i.json(),
      role: i.string(),
    }),
    previewApps: i.entity({
      appId: i.string(),
      expiresAt: i.date(),
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
    chatsPreviewApp: {
      forward: {
        on: 'chats',
        has: 'one',
        label: 'previewApp',
      },
      reverse: {
        on: 'previewApps',
        has: 'one',
        label: 'chat',
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
    messagesChat: {
      forward: {
        on: 'messages',
        has: 'one',
        label: 'chat',
      },
      reverse: {
        on: 'chats',
        has: 'many',
        label: 'messages',
      },
    },
    messagesOwner: {
      forward: {
        on: 'messages',
        has: 'one',
        label: 'owner',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'messages',
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

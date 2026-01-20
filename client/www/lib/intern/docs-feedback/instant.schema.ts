// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/react';
import { UIMessagePart } from 'ai';

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    ratings: i.entity({
      extraComment: i.string().optional(),
      key: i.string().unique(),
      localId: i.string(),
      pageId: i.string().indexed(),
      wasHelpful: i.boolean(),
      createdAt: i.date().indexed().optional(),
      isArchived: i.boolean().indexed().optional(),
    }),
    chats: i.entity({
      createdAt: i.date().indexed(),
      localId: i.string(),
      createdByUserId: i.string(),
    }),
    messages: i.entity({
      index: i.number().indexed(),
      role: i.string(),
      metadata: i.any().optional(),
      parts: i.json<Array<UIMessagePart<any, any>>>(),
      createdAt: i.date().indexed(),
    }),
    llmUsage: i.entity({
      userId: i.string(),
      usedAt: i.date().indexed(),
      tokens: i.number().indexed(),
    }),
  },
  links: {
    chatMessages: {
      forward: {
        on: 'chats',
        has: 'many',
        label: 'messages',
        required: false,
      },
      reverse: {
        on: 'messages',
        has: 'one',
        label: 'chat',
        required: true,
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

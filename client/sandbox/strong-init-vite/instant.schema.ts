// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    posts: i.entity({
      title: i.string(),
      body: i.string(),
    }),
    messages: i.entity({
      content: i.string(),
    }),
  },
  links: {
    postsOwner: {
      forward: {
        on: 'posts',
        has: 'one',
        label: 'owner',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'ownedPosts',
      },
    },
    messageCreator: {
      forward: {
        on: 'messages',
        has: 'one',
        label: 'creator',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'createdMessages',
      },
    },
  },
  rooms: {
    chat: {
      presence: i.entity({
        color: i.string(),
        nickname: i.string(),
      }),
      topics: {
        emote: i.entity({
          emoji: i.string(),
          x: i.number(),
          y: i.number(),
        }),
      },
    },
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export { type AppSchema };
export default schema;

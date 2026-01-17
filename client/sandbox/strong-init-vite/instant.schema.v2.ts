import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    messages: i.entity({
      content: i.string(),
      createdAt: i.date().optional(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
  },
  links: {
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
        name: i.string(),
        avatarURI: i.string(),
      }),
      topics: {
        emoji: i.entity({
          name: i.string<EmojiName>(),
          rotationAngle: i.number(),
          directionAngle: i.number(),
        }),
      },
    },
  },
});

export type EmojiName = 'fire' | 'wave' | 'confetti' | 'heart';

type _AppSchema = typeof _schema;

export interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export default schema;

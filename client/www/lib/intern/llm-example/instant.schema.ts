import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    profiles: i.entity({
      handle: i.string(),
    }),
    posts: i.entity({
      text: i.string(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    userProfiles: {
      forward: { on: 'profiles', has: 'one', label: 'user' },
      reverse: { on: '$users', has: 'one', label: 'profile' },
    },
    postAuthors: {
      forward: { on: 'posts', has: 'one', label: 'author', required: true },
      reverse: { on: 'profiles', has: 'many', label: 'posts' },
    },
    profileAvatars: {
      forward: { on: 'profiles', has: 'one', label: 'avatar' },
      reverse: { on: '$files', has: 'one', label: 'profile' },
    },
  },
  rooms: {
    todos: {
      presence: i.entity({}),
      topics: {
        shout: i.entity({
          text: i.string(),
          x: i.number(),
          y: i.number(),
          angle: i.number(),
          size: i.number(),
        }),
      },
    },
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

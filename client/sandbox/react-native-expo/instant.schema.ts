// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/react-native';

const _schema = i.schema({
  // This section lets you define entities: think `posts`, `comments`, etc
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
  },
  // You can define links here.
  // For example, if `posts` should have many `comments`.
  links: {},
  // If you use presence, you can define a room schema here
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

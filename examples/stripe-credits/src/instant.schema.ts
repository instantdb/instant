// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      credits: i.number().optional(), // Current credit balance
      stripeCustomerId: i.string().optional(),
    }),
    haikus: i.entity({
      topic: i.string(),
      content: i.string(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    userHaikus: {
      forward: { on: "haikus", has: "one", label: "author", onDelete: "cascade" },
      reverse: { on: "$users", has: "many", label: "haikus" },
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

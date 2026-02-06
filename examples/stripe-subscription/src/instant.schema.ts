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
      stripeCustomerId: i.string().optional(),
      subscriptionStatus: i.string().optional(), // 'active' | 'canceled' | 'past_due' | undefined
      cancelAt: i.number().optional(), // Unix timestamp when subscription will cancel
    }),
    posts: i.entity({
      title: i.string(),
      content: i.string(),
      teaser: i.string(),
      isPremium: i.boolean(),
      publishedAt: i.number().indexed(),
    }),
  },
  links: {},
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

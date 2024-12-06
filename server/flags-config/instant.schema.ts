// http://localhost:3000/dash?s=main&t=home&app=24a4d71b-7bb2-4630-9aee-01146af26239
// Docs: https://www.instantdb.com/docs/schema

import { i } from "@instantdb/core";

const graph = i.graph(
  {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    "drop-refresh-spam": i.entity({
      "default-value": i.boolean(),
      "disabled-apps": i.any(),
      "enabled-apps": i.any(),
    }),
    "friend-emails": i.entity({
      email: i.string().unique(),
    }),
    hazelcast: i.entity({
      "default-value": i.boolean(),
      disabled: i.boolean(),
      "disabled-apps": i.any(),
      "enabled-apps": i.any(),
    }),
    "power-user-emails": i.entity({
      email: i.string().unique(),
    }),
    "promo-emails": i.entity({
      email: i.string(),
    }),
    "rate-limited-apps": i.entity({
      appId: i.string().unique()
    }),
    "storage-whitelist": i.entity({
      appId: i.string().unique().indexed(),
      email: i.string(),
      isEnabled: i.boolean(),
    }),
    "team-emails": i.entity({
      email: i.string(),
    }),
    "test-emails": i.entity({
      email: i.string(),
    }),
  },
  // You can define links here.
  // For example, if `posts` should have many `comments`.
  // More in the docs:
  // https://www.instantdb.com/docs/schema#defining-links
  {},
);

export default graph;

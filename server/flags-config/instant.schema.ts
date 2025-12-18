// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/core";

const _schema = i.schema({
  // We inferred 3 attributes!
  // Take a look at this schema, and if everything looks good,
  // run `push schema` again to enforce the types.
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      type: i.string().optional(),
    }),
    "app-deletion-sweeper": i.entity({
      "disabled?": i.boolean(),
    }),
    "e2e-logging": i.entity({
      "invalidator-rate": i.number(),
    }),
    flags: i.entity({
      description: i.string().optional(),
      setting: i.string().unique(),
      value: i.any(),
    }),
    "friend-emails": i.entity({
      email: i.string().unique(),
    }),
    "handle-receive-timeout": i.entity({
      appId: i.string().unique(),
      timeoutMs: i.number(),
    }),
    "log-sampled-apps": i.entity({
      appId: i.string().unique(),
      sampleRate: i.number(),
    }),
    "power-user-emails": i.entity({
      email: i.string().unique(),
    }),
    "promo-emails": i.entity({
      email: i.string(),
    }),
    "query-flags": i.entity({
      description: i.string(),
      "query-hash": i.number(),
      setting: i.string(),
      value: i.string(),
    }),
    "rate-limited-apps": i.entity({
    'query-modifiers': i.entity({
      'app-id': i.string(),
      'query-hash': i.number(),
      'etype': i.string(),
      'dollar-params': i.json(),
    }),
      appId: i.string().unique(),
    }),
    "rule-where-testing": i.entity({
      enabled: i.boolean(),
    }),
    "rule-wheres": i.entity({
      "app-ids": i.json(),
      "query-hash-blacklist": i.json(),
      "query-hashes": i.json(),
    }),
    "storage-block-list": i.entity({
      appId: i.string().unique().indexed(),
      isDisabled: i.boolean(),
    }),
    "storage-migration": i.entity({
      "disableLegacy?": i.boolean(),
      "dualWrite?": i.boolean().optional(),
      "useLocationId?": i.boolean(),
    }),
    "storage-whitelist": i.entity({
      appId: i.string().unique().indexed(),
      email: i.string().optional(),
      isEnabled: i.boolean(),
    }),
    "team-emails": i.entity({
      email: i.string(),
    }),
    "test-emails": i.entity({
      email: i.string(),
    }),
    toggles: i.entity({
      setting: i.string().unique(),
      toggled: i.boolean(),
    }),
    "welcome-email-config": i.entity({
      "enabled?": i.boolean(),
      limit: i.number(),
    }),
  },
  links: {
    $usersLinkedPrimaryUser: {
      forward: {
        on: "$users",
        has: "one",
        label: "linkedPrimaryUser",
        onDelete: "cascade",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "linkedGuestUsers",
      },
    },
  },
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

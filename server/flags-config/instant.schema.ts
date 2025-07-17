// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/core";

const _schema = i.schema({
  // We inferred 8 attributes!
  // Take a look at this schema, and if everything looks good,
  // run `push schema` again to enforce the types.
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    "app-deletion-sweeper": i.entity({
      "disabled?": i.boolean(),
    }),
    "app-users-to-triples-migration": i.entity({
      appId: i.string().optional(),
      processId: i.string().optional(),
    }),
    "drop-refresh-spam": i.entity({
      "default-value": i.boolean(),
      "disabled-apps": i.any().optional(),
      "enabled-apps": i.any().optional(),
    }),
    "e2e-logging": i.entity({
      "invalidator-rate": i.number(),
    }),
    flags: i.entity({
      setting: i.string().unique(),
      value: i.json(),
    }),
    "friend-emails": i.entity({
      email: i.string().unique(),
    }),
    hazelcast: i.entity({
      "default-value": i.boolean().optional(),
      disabled: i.boolean().optional(),
      "disabled-apps": i.json().optional(),
      "enabled-apps": i.json().optional(),
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
      appId: i.string().unique(),
    }),
    "handle-receive-timeout": i.entity({
      appId: i.string().unique(),
      timeoutMs: i.number(),
    }),
    "refresh-skip-attrs": i.entity({
      "default-value": i.boolean().optional(),
      disabled: i.boolean().optional(),
      "disabled-apps": i.json().optional(),
      "enabled-apps": i.any().optional(),
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
    threading: i.entity({
      "use-vfutures": i.boolean(),
    }),
    toggles: i.entity({
      setting: i.string().unique(),
      toggled: i.boolean(),
    }),
    "use-patch-presence": i.entity({
      "default-value": i.boolean(),
      disabled: i.boolean(),
      "disabled-apps": i.any(),
      "enabled-apps": i.any(),
    }),
    "view-checks": i.entity({
      "default-value": i.boolean().optional(),
      "disabled-apps": i.json().optional(),
      "enabled-apps": i.json().optional(),
    }),
    "welcome-email-config": i.entity({
      "enabled?": i.boolean(),
      limit: i.number(),
    }),
  },
  links: {},
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema { }
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

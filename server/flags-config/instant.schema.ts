// instant-config
// https://instantdb.com/dash?s=main&t=home&app=24a4d71b-7bb2-4630-9aee-01146af26239

import { i } from "@instantdb/core";

const graph = i.graph(
  {
    "$users": i.entity({
      "email": i.string().unique().indexed(),
    }),
    "app-users-to-triples-migration": i.entity({
      "appId": i.string(),
      "processId": i.string(),
    }),
    "friend-emails": i.entity({
      "email": i.string().unique(),
    }),
    "hazelcast": i.entity({
      "default-value": i.boolean(),
      "disabled": i.boolean(),
      "disabled-apps": i.any(),
      "enabled-apps": i.any(),
    }),
    "power-user-emails": i.entity({
      "email": i.string().unique(),
    }),
    "promo-emails": i.entity({
      "email": i.string(),
    }),
    "storage-whitelist": i.entity({
      "appId": i.string().unique().indexed(),
      "email": i.string(),
      "isEnabled": i.boolean(),
    }),
    "team-emails": i.entity({
      "email": i.string(),
    }),
    "test-emails": i.entity({
      "email": i.string(),
    }),
    "view-checks": i.entity({
      "default-value": i.boolean(),
      "disabled-apps": i.any(),
      "enabled-apps": i.any(),
    }),
  },
  {}
);

export default graph;

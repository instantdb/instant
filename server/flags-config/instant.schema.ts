// instant-config
// https://instantdb.com/dash?s=main&t=home&app=24a4d71b-7bb2-4630-9aee-01146af26239

import { i } from "@instantdb/core";

const graph = i.graph(
  {
    "friend-emails": i.entity({
      "email": i.any().unique(),
    }),
    "hazelcast": i.entity({
      "default-value": i.any(),
      "disabled": i.any(),
      "disabled-apps": i.any(),
      "enabled-apps": i.any(),
    }),
    "power-user-emails": i.entity({
      "email": i.any().unique(),
    }),
    "promo-emails": i.entity({
      "email": i.any(),
    }),
    "storage-whitelist": i.entity({
      "appId": i.any().unique().indexed(),
      "email": i.any(),
      "isEnabled": i.any(),
    }),
    "team-emails": i.entity({
      "email": i.any(),
    }),
    "test-emails": i.entity({
      "email": i.any(),
    }),
    "view-checks": i.entity({
      "default-value": i.any(),
      "disabled-apps": i.any(),
      "enabled-apps": i.any(),
    }),
  },
  {}
);

export default graph;

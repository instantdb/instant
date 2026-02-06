// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  posts: {
    allow: {
      view: "true",
      create: "false",
      delete: "false",
      update: "false",
    },
    bind: ["isSubscriber", "auth.subscriptionStatus == 'active'"],
    fields: {
      content: "!data.isPremium || isSubscriber",
    },
  },
} satisfies InstantRules;

export default rules;

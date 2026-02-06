// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  wallpapers: {
    allow: {
      view: "true",
      create: "false",
      update: "false",
      delete: "false",
    },
    fields: {
      // Only return fullResUrl if the token matches a linked purchase
      fullResUrl: "ruleParams.token in data.ref('purchases.token')",
    },
  },
  purchases: {
    allow: {
      // Viewable if authenticated user's email matches
      view: "data.email == auth.email",
      create: "false",
      update: "false",
      delete: "false",
    },
  },
} satisfies InstantRules;

export default rules;

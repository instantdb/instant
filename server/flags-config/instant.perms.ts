// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/core";

const rules = {
  attrs: {
    allow: {
      create: "false",
    },
  },
  $default: {
    allow: {
      $default: "false",
    },
  },
} satisfies InstantRules;

export default rules;

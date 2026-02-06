// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  haikus: {
    allow: {
      view: "isAuthor",
      create: "false", // Created via admin SDK
      update: "false",
      delete: "isAuthor",
    },
    bind: ["isAuthor", "auth.id in data.ref('author.id')"],
  },
} satisfies InstantRules;

export default rules;

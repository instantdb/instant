// Docs: https://www.instantdb.com/docs/permissions

import { type InstantRules } from "@instantdb/react";

const rules = {
  attrs: {
    allow: {
      create: "false",
    },
  },
  posts: {
    bind: [
      "isAdmin",
      "auth.email == 'stepan.p@gmail.com'",
      "isOwner",
      "auth.uid == data.author",
    ],
    allow: {
      create: "isAdmin || isOwner",
      delete: "isAdmin || isOwner",
      update: "isAdmin || isOwner",
    },
  },
  postBodies: {
    bind: ["isAdmin", "auth.email == 'stepan.p@gmail.com'"],
    allow: {
      create: "isAdmin",
      delete: "isAdmin",
      update: "isAdmin",
    },
  },
} satisfies InstantRules;

export default rules;

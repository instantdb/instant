// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from '@instantdb/react';

const rules = {
  chats: {
    allow: {
      view: 'auth.id != null && auth.id == data.owner',
      create: 'auth.id != null && auth.id == data.owner',
    },
  },
  $users: {
    allow: {
      view: 'auth.id != null && auth.id == data.id',
    },
  },
  $default: {
    allow: {
      $default: 'false',
    },
  },
  $streams: {
    allow: {
      view: "auth.id != null && auth.id in data.ref('chat.owner.id')",
    },
  },
  messages: {
    allow: {
      view: "auth.id != null && auth.id in data.ref('chat.owner.id')",
    },
  },
} satisfies InstantRules;

export default rules;

// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from '@instantdb/react';

const rules = {
  chats: {
    bind: {
      isOwner: 'auth.id != null && auth.id == data.owner',
    },
    allow: {
      view: 'true',
      create: 'isOwner',
      delete: 'false',
      update: 'false',
    },
  },
  $streams: {
    allow: {
      view: 'true',
      create: 'false',
      delete: 'false',
      update: 'false',
    },
  },
  messages: {
    allow: {
      view: 'true',
      create: 'false',
      delete: 'false',
      update: 'false',
    },
  },
  previewApps: {
    allow: {
      view: 'true',
      create: 'false',
      delete: 'false',
      update: 'false',
    },
  },
} satisfies InstantRules;

export default rules;

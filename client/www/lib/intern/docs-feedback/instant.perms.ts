// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from '@instantdb/react';

const rules = {
  $streams: {
    bind: {
      isAdmin: "auth.id != null && auth.email.endsWith('@instantdb.com')",
      isCreator: 'ruleParams.localId == data.localId',
    },
    allow: {
      view: 'isAdmin || isCreator',
    },
  },
  ratings: {
    bind: [
      'isAdmin',
      "auth.id != null && auth.email.endsWith('@instantdb.com')",
      'isCreator',
      'ruleParams.localId == data.localId',
      'hasValidKey',
      '(data.localId + "_" + data.pageId) == data.key',
      'updatesAreValid',
      'newData.localId == data.localId && newData.pageId == data.pageId && newData.key == data.key',
    ],
    allow: {
      view: 'isCreator || isAdmin',
      create: 'isCreator && hasValidKey',
      delete: 'isCreator || isAdmin',
      update: '(isCreator && updatesAreValid) || isAdmin',
    },
  },
  chats: {
    bind: [
      'isAdmin',
      "auth.id != null && auth.email.endsWith('@instantdb.com')",
      'isCreator',
      'ruleParams.localId == data.localId',
    ],
    allow: {
      create: 'isCreator',
      view: 'isCreator || isAdmin',
      delete: 'isCreator || isAdmin',
      update: '(isCreator || isAdmin) && data.localId == newData.localId',
    },
  },
  messages: {
    bind: {
      isAdmin: "auth.id != null && auth.email.endsWith('@instantdb.com')",
      isCreator: "ruleParams.localId in data.ref('chat.localId')",
    },
    allow: {
      create: 'isCreator',
      view: 'isCreator || isAdmin',
      update: 'isCreator || isAdmin',
      delete: 'isCreator || isAdmin',
    },
  },
  llmUsage: {
    bind: {
      isAdmin: "auth.id != null && auth.email.endsWith('@instantdb.com')",
    },
    allow: {
      view: 'isAdmin',
    },
  },
  $default: {
    allow: {
      $default: 'false',
    },
  },
} satisfies InstantRules;

export default rules;

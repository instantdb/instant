// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from '@instantdb/react';

const rules = {
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
    allow: {
      view: 'true',
      $default: 'true',
    },
  },
  messages: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
    },
  },
  $default: {
    allow: {
      $default: 'false',
    },
  },
} satisfies InstantRules;

export default rules;

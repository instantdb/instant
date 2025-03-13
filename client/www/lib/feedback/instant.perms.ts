// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from '@instantdb/react';

const rules = {
  // We are in production. By default, let's disallow everything.
  $default: {
    allow: {
      $default: 'false',
    },
  },

  ratings: {
    bind: [
      'isCreator',
      'ruleParams.localId == data.localId',

      'hasValidKey',
      '(data.localId + "_" + data.pageId) == data.key',

      'updatesAreValid',
      'newData.localId == data.localId && newData.pageId == data.pageId && newData.key == data.key',
    ],
    allow: {
      // You can only see ratings you've creating
      view: 'isCreator',
      // You can only create ratings for yourself
      create: 'isCreator && hasValidKey',
      // You can update your rating, but can't change ownership
      update: 'isCreator && updatesAreValid',
      // You can delete your own ratings
      delete: 'isCreator',
    },
  },
} satisfies InstantRules;

export default rules;

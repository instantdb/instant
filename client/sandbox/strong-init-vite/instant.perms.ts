// Docs: https://www.instantdb.com/docs/permissions

import { type InstantRules } from '@instantdb/react';

const rules = {
  attrs: {
    allow: {
      create: 'false',
    },
  },
} satisfies InstantRules;

export default rules;

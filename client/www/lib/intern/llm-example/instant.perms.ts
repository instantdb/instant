import type { InstantRules } from '@instantdb/react';

const rules = {
  $files: {
    allow: {
      view: 'true',
      create: 'isOwner',
      update: 'isOwner',
      delete: 'isOwner',
    },
    bind: ['isOwner', "auth.id != null && data.path.startsWith(auth.id + '/')"],
  },
  profiles: {
    allow: {
      view: 'true',
      create: 'isOwner',
      update: 'isOwner',
      delete: 'false',
    },
    bind: ['isOwner', 'auth.id != null && auth.id == data.id'],
  },
  posts: {
    allow: {
      view: 'true',
      create: 'isOwner',
      update: 'isOwner',
      delete: 'isOwner',
    },
    bind: ['isOwner', "auth.id in data.ref('author.id')"],
  },
} satisfies InstantRules;

export default rules;

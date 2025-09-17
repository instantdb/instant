// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from '@instantdb/react';

const rules = {
  attrs: {
    allow: {
      $default: 'false',
    },
  },
  tasks: {
    bind: ['isMember', "auth.id in data.ref('project.members.id')"],
    allow: {
      $default: 'isMember',
    },
  },
  $users: {
    allow: {
      view: "auth.id == data.id || data.id in auth.ref('$user.memberProjects.members.id')",
    },
  },
  invites: {
    bind: ['isAdmin', "auth.id in data.ref('project.admins.id')"],
    allow: {
      $default: 'isAdmin',
    },
  },
  projects: {
    bind: [
      'isAdmin',
      "auth.id in data.ref('admins.id')",
      'isMember',
      "auth.id in data.ref('members.id')",
    ],
    allow: {
      create: 'true',
      $default: 'isMember',
      link: {
        // if I create a project I should be admin
        // if this runs after tx then you can make yourself admin
        members: 'ruleParams.secret in data.ref(\'invites.secret\')',
        admins: 'isAdmin || (newData == null && linkedData.id == auth.id)',
      },
      unlink: {
        members: 'isAdmin', //  || linkedData.id == auth.id',
        admins: 'isAdmin', // || linkedData.id == auth.id',
      },
    },
  },
} satisfies InstantRules;

export default rules;

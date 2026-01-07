// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from '@instantdb/react';

const rules = {
  attrs: {
    allow: {
      $default: 'false',
    },
  },
  tasks: {
    bind: {
      isMember: "auth.id in data.ref('project.members.id')",
    },
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
      'isNewProject',
      'actions.data == "create"',
      'linkingMyself',
      'linkedData.id == auth.id',
    ],
    allow: {
      link: {
        admins: 'isNewProject ? linkingMyself : isAdmin',
        members:
          'linkingMyself && (isNewProject || ruleParams.secret in data.ref("invites.secret"))',
      },
      create: 'true',
      unlink: {
        admins: 'isAdmin || linkingMyself',
        members: 'isAdmin || linkingMyself',
      },
      $default: 'isMember',
    },
  },
} satisfies InstantRules;

export default rules;

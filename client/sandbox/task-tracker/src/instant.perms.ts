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

      'isNewProject',
      'data["$action"] == "create"',

      'linkingMyself',
      'linkedData.id == auth.id',
    ],
    allow: {
      create: 'true',
      $default: 'isMember',
      link: {
        // admin can't add members directly, only via invite
        // I can only join as myself
        // I must know invite secret
        members: 'linkingMyself && ruleParams.secret in data.ref(\'invites.secret\')',

        // On new projects, I must set myself as admin
        // Otherwise, admin can promote
        admins: 'isNewProject ? linkingMyself : isAdmin',
      },
      unlink: {
        members: 'isAdmin || linkingMyself',
        admins: 'isAdmin || linkingMyself',
      },
    },
  },
} satisfies InstantRules;

export default rules;

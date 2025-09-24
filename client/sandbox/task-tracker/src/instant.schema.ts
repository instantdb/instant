// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    invites: i.entity({
      createdAt: i.number().indexed(),
      secret: i.string(),
    }),
    projects: i.entity({
      createdAt: i.number().indexed(),
      name: i.string(),
      updatedAt: i.number().indexed(),
    }),
    tasks: i.entity({
      category: i.string().indexed(),
      createdAt: i.number().indexed(),
      description: i.string().optional(),
      status: i.string().indexed(),
      title: i.string(),
      updatedAt: i.number().indexed(),
    }),
  },
  links: {
    invitesProject: {
      forward: {
        on: 'invites',
        has: 'one',
        label: 'project',
        required: true,
        onDelete: 'cascade',
      },
      reverse: {
        on: 'projects',
        has: 'many',
        label: 'invites',
      },
    },
    projectsAdmins: {
      forward: {
        on: 'projects',
        has: 'many',
        label: 'admins',
        required: true,
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'adminProjects',
      },
    },
    projectsMembers: {
      forward: {
        on: 'projects',
        has: 'many',
        label: 'members',
        required: true,
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'memberProjects',
      },
    },
    tasksAssignee: {
      forward: {
        on: 'tasks',
        has: 'one',
        label: 'assignee',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'assignedTasks',
      },
    },
    tasksProject: {
      forward: {
        on: 'tasks',
        has: 'one',
        label: 'project',
        onDelete: 'cascade',
        required: true,
      },
      reverse: {
        on: 'projects',
        has: 'many',
        label: 'tasks',
      },
    },
    tasksReporter: {
      forward: {
        on: 'tasks',
        has: 'one',
        label: 'reporter',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'reportedTasks',
      },
    },
  },
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;

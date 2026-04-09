import { PlatformApi } from '@instantdb/platform';
import { i } from '@instantdb/core';
import config from '@/lib/config';
import { type DemoState } from './Demos';

export const schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
    }),
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.number().indexed(),
    }),
  },
  links: {
    todoFiles: {
      forward: { on: 'todos', has: 'many', label: '$files' },
      reverse: { on: '$files', has: 'many', label: 'todos' },
    },
  },
});

export async function createDemoApp(): Promise<NonNullable<DemoState['app']>> {
  const api = new PlatformApi({ apiURI: config.apiURI });
  const start = Date.now();
  const { app, expiresMs } = await api.createTemporaryApp({
    title: 'Architecture Essay App',
    schema,
    rules: {
      code: {
        $files: {
          allow: {
            view: 'true',
            create: 'true',
          },
        },
      },
    },
  });
  const timeTaken = Date.now() - start;
  return {
    id: app.id,
    adminToken: app.adminToken,
    timeTaken,
    expiresMs,
  };
}

import { test, expect } from 'vitest';
import { i, schemaTypescriptFileToInstantSchema } from '@instantdb/platform';
import { updateSchemaFile } from '../src/util/updateSchemaFile';

test('preserves type annotations while adding entities', async () => {
  const oldFile = `
import { i } from '@instantdb/core';
import { Label } from './types';

const _schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string(),
      status: i.string<'todo' | 'done'>(),
      labels: i.json<Label[]>(),
    }),
  },
  links: {},
  rooms: {},
});

export default _schema;
`;

  const serverSchema = i.schema({
    entities: {
      todos: i.entity({
        title: i.string(),
        status: i.string(),
        labels: i.json(),
      }),
      projects: i.entity({
        name: i.string(),
      }),
    },
    links: {},
  });

  const localSchema = schemaTypescriptFileToInstantSchema(oldFile);
  const result = await updateSchemaFile(oldFile, localSchema, serverSchema);

  expect(result).toContain("status: i.string<'todo' | 'done'>()");
  expect(result).toContain('labels: i.json<Label[]>()');
  expect(result).toContain("import { Label } from './types';");
  expect(result).toContain('projects: i.entity({');
});

test('removes deleted entities and attributes', async () => {
  const oldFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string(),
      priority: i.number(),
    }),
    oldEntity: i.entity({
      data: i.json(),
    }),
  },
  links: {},
  rooms: {},
});

export default _schema;
`;

  const serverSchema = i.schema({
    entities: {
      todos: i.entity({
        title: i.string(),
      }),
    },
    links: {},
  });

  const localSchema = schemaTypescriptFileToInstantSchema(oldFile);
  const result = await updateSchemaFile(oldFile, localSchema, serverSchema);

  expect(result).not.toContain('oldEntity');
  expect(result).not.toContain('priority: i.number()');
  expect(result).toContain('title: i.string()');
});

test('updates constraints and adds links', async () => {
  const oldFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string(),
      status: i.string<'todo' | 'done'>(),
    }),
    users: i.entity({
      email: i.string(),
    }),
  },
  links: {},
  rooms: {},
});

export default _schema;
`;

  const serverSchema = i.schema({
    entities: {
      todos: i.entity({
        title: i.string().unique().indexed().optional(),
        status: i.string(),
      }),
      users: i.entity({
        email: i.string().unique(),
      }),
    },
    links: {
      todoOwner: {
        forward: { on: 'todos', has: 'one', label: 'owner' },
        reverse: { on: 'users', has: 'many', label: 'todos' },
      },
    },
  });

  const localSchema = schemaTypescriptFileToInstantSchema(oldFile);
  const result = await updateSchemaFile(oldFile, localSchema, serverSchema);

  expect(result).toContain('title: i.string().unique().indexed().optional()');
  expect(result).toContain("status: i.string<'todo' | 'done'>()");
  expect(result).toContain('todoOwner: {');
  expect(result).toContain("on: 'todos'");
  expect(result).toContain("label: 'owner'");
  expect(result).toContain("on: 'users'");
  expect(result).toContain("label: 'todos'");
});

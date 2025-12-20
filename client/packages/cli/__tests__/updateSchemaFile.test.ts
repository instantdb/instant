import { test, expect } from 'vitest';
import { i, schemaTypescriptFileToInstantSchema } from '@instantdb/platform';
import { updateSchemaFile } from '../src/util/updateSchemaFile';

function schemaStr(
  entitiesBlock: string,
  linksBlock: string,
  extraImports = '',
) {
  const linksSection = linksBlock ? `${linksBlock}\n` : '';
  return `
import { i } from '@instantdb/core';
${extraImports ? `${extraImports}\n` : ''}
const _schema = i.schema({
  entities: {
${entitiesBlock}
  },
  links: {
${linksSection}  },
  rooms: {},
});

export default _schema;
`;
}

async function runUpdate(oldFile: string, serverSchema: any) {
  const localSchema = schemaTypescriptFileToInstantSchema(oldFile);
  return updateSchemaFile(oldFile, localSchema, serverSchema);
}

test('throws when schema call is missing', async () => {
  const oldFile = `
import { i } from '@instantdb/core';

export const nope = 1;
`;
  const schema = i.schema({
    entities: { todos: i.entity({ title: i.string() }) },
    links: {},
  });
  await expect(updateSchemaFile(oldFile, schema, schema)).rejects.toThrow(
    'Could not find i.schema',
  );
});

test('throws when entities object is missing', async () => {
  const oldFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  links: {},
  rooms: {},
});

export default _schema;
`;
  const schema = i.schema({
    entities: { todos: i.entity({ title: i.string() }) },
    links: {},
  });
  await expect(updateSchemaFile(oldFile, schema, schema)).rejects.toThrow(
    'entities object',
  );
});

test('throws when links object is missing', async () => {
  const oldFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string(),
    }),
  },
  rooms: {},
});

export default _schema;
`;
  const schema = i.schema({
    entities: { todos: i.entity({ title: i.string() }) },
    links: {},
  });
  await expect(updateSchemaFile(oldFile, schema, schema)).rejects.toThrow(
    'links object',
  );
});

test('preserves type params across chained calls', async () => {
  const oldFile = schemaStr(
    `    todos: i.entity({
      title: i.string(),
      status: i.string<'todo' | 'done'>().optional().indexed(),
      labels: i.json<Label[]>(),
    }),
    users: i.entity({
      email: i.string(),
    }),`,
    '',
    "import { Label } from './types';",
  );
  const serverSchema = i.schema({
    entities: {
      todos: i.entity({
        title: i.string(),
        status: i.string().unique().indexed(),
        labels: i.json(),
      }),
      users: i.entity({
        email: i.string().unique(),
      }),
    },
    links: {},
  });

  const result = await runUpdate(oldFile, serverSchema);

  expect(result).toMatchSnapshot();
});

test('drops constraints removed by server', async () => {
  const oldFile = schemaStr(
    `    todos: i.entity({
      title: i.string().unique().indexed().optional(),
      done: i.boolean().optional(),
    }),`,
    '',
  );
  const serverSchema = i.schema({
    entities: {
      todos: i.entity({
        title: i.string(),
        done: i.boolean().optional(),
      }),
    },
    links: {},
  });

  const result = await runUpdate(oldFile, serverSchema);

  expect(result).toMatchSnapshot();
});

test('updates link details by forward key', async () => {
  const oldFile = schemaStr(
    `    todos: i.entity({
      title: i.string(),
    }),
    users: i.entity({
      email: i.string(),
    }),`,
    `    todoOwner: {
      forward: { on: 'todos', has: 'one', label: 'owner' },
      reverse: { on: 'users', has: 'many', label: 'todos' },
    },`,
  );
  const serverSchema = i.schema({
    entities: {
      todos: i.entity({ title: i.string() }),
      users: i.entity({ email: i.string() }),
    },
    links: {
      todoOwner: {
        forward: {
          on: 'todos',
          has: 'one',
          label: 'owner',
          required: true,
          onDelete: 'cascade',
        },
        reverse: {
          on: 'users',
          has: 'many',
          label: 'todos',
          onDelete: 'cascade',
        },
      },
    },
  });

  const result = await runUpdate(oldFile, serverSchema);

  expect(result).toMatchSnapshot();
});

test('removes a link with surrounding comments and commas', async () => {
  const oldFile = schemaStr(
    `    todos: i.entity({
      title: i.string(),
    }),
    users: i.entity({
      email: i.string(),
    }),
    projects: i.entity({
      name: i.string(),
    }),`,
    `    // owner link
    todoOwner: {
      forward: { on: 'todos', has: 'one', label: 'owner' },
      reverse: { on: 'users', has: 'many', label: 'todos' },
    },
    /* project link */
    projectTodos: {
      forward: { on: 'projects', has: 'many', label: 'todos' },
      reverse: { on: 'todos', has: 'one', label: 'project' },
    },`,
  );
  const serverSchema = i.schema({
    entities: {
      todos: i.entity({ title: i.string() }),
      users: i.entity({ email: i.string() }),
      projects: i.entity({ name: i.string() }),
    },
    links: {
      projectTodos: {
        forward: { on: 'projects', has: 'many', label: 'todos' },
        reverse: { on: 'todos', has: 'one', label: 'project' },
      },
    },
  });

  const result = await runUpdate(oldFile, serverSchema);

  expect(result).toMatchSnapshot();
});

test('updates single-line entity in place', async () => {
  const oldFile = schemaStr(
    `    projects: i.entity({ name: i.string() }),
    todos: i.entity({
      title: i.string(),
    }),`,
    '',
  );
  const serverSchema = i.schema({
    entities: {
      projects: i.entity({
        name: i.string(),
        status: i.string(),
      }),
      todos: i.entity({
        title: i.string(),
      }),
    },
    links: {},
  });

  const result = await runUpdate(oldFile, serverSchema);

  expect(result).toMatchSnapshot();
});

test('inserts attrs into multi-line entities with indentation', async () => {
  const oldFile = schemaStr(
    `    todos: i.entity({
      title: i.string(),
      done: i.boolean().optional(),
    }),`,
    '',
  );
  const serverSchema = i.schema({
    entities: {
      todos: i.entity({
        title: i.string(),
        done: i.boolean().optional(),
        priority: i.number(),
      }),
    },
    links: {},
  });

  const result = await runUpdate(oldFile, serverSchema);

  expect(result).toMatchSnapshot();
});

test('handles quoted keys for entities, attrs, and links', async () => {
  const oldFile = schemaStr(
    `    todos: i.entity({
      title: i.string(),
    }),
    users: i.entity({
      email: i.string(),
    }),
    'user-profiles': i.entity({
      'display-name': i.string(),
    }),`,
    '',
  );
  const serverSchema = i.schema({
    entities: {
      todos: i.entity({ title: i.string() }),
      users: i.entity({ email: i.string() }),
      'user-profiles': i.entity({
        'display-name': i.string(),
        'avatar-url': i.string(),
      }),
    },
    links: {
      'todo-owner': {
        forward: { on: 'todos', has: 'one', label: 'owner' },
        reverse: { on: 'users', has: 'many', label: 'todos' },
      },
    },
  });

  const result = await runUpdate(oldFile, serverSchema);

  expect(result).toMatchSnapshot();
});

test('adds a link when links object is empty', async () => {
  const oldFile = schemaStr(
    `    todos: i.entity({
      title: i.string(),
    }),
    users: i.entity({
      email: i.string(),
    }),`,
    '',
  );
  const serverSchema = i.schema({
    entities: {
      todos: i.entity({ title: i.string() }),
      users: i.entity({ email: i.string() }),
    },
    links: {
      todoOwner: {
        forward: { on: 'todos', has: 'one', label: 'owner' },
        reverse: { on: 'users', has: 'many', label: 'todos' },
      },
    },
  });

  const result = await runUpdate(oldFile, serverSchema);

  expect(result).toMatchSnapshot();
});

test('removes the last link cleanly', async () => {
  const oldFile = schemaStr(
    `    todos: i.entity({
      title: i.string(),
    }),
    users: i.entity({
      email: i.string(),
    }),`,
    `    todoOwner: {
      forward: { on: 'todos', has: 'one', label: 'owner' },
      reverse: { on: 'users', has: 'many', label: 'todos' },
    },`,
  );
  const serverSchema = i.schema({
    entities: {
      todos: i.entity({ title: i.string() }),
      users: i.entity({ email: i.string() }),
    },
    links: {},
  });

  const result = await runUpdate(oldFile, serverSchema);

  expect(result).toMatchSnapshot();
});

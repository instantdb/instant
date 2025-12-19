import { describe, test, expect } from 'vitest';
import { mergeSchema } from '../src/util/mergeSchema';

test('preserves type annotations', () => {
  const oldFile = `
import { i } from '@instantdb/core';
import { Label } from './types';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    todos: i.entity({
      title: i.string(),
      status: i.string<'todo' | 'in_progress' | 'done'>(),
      priority: i.number<1 | 2 | 3>(),
      labels: i.json<Label[]>().optional(),
    }),
    projects: i.entity({
      name: i.string(),
    }),
  },
  links: {
    todoProject: {
      forward: { on: 'todos', has: 'one', label: 'project' },
      reverse: { on: 'projects', has: 'many', label: 'todos' },
    },
    projectOwner: {
      forward: { on: 'projects', has: 'one', label: 'owner' },
      reverse: { on: '$users', has: 'many', label: 'projects' },
    },
  },
  rooms: {
    projectRoom: {
      presence: i.entity({
        cursor: i.json<{ x: number; y: number }>(),
      }),
    },
  },
});

export default _schema;
`;

  const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    todos: i.entity({
      title: i.string(),
      status: i.string(),
      priority: i.number(),
      labels: i.json().optional(),
    }),
    projects: i.entity({
      name: i.string(),
    }),
  },
  links: {
    todoProject: {
      forward: { on: 'todos', has: 'one', label: 'project' },
      reverse: { on: 'projects', has: 'many', label: 'todos' },
    },
    projectOwner: {
      forward: { on: 'projects', has: 'one', label: 'owner' },
      reverse: { on: '$users', has: 'many', label: 'projects' },
    },
  },
  rooms: {
    projectRoom: {
      presence: i.entity({
        cursor: i.json(),
      }),
    },
  },
});

export default _schema;
`;

  const result = mergeSchema(oldFile, newFile);

  // Type annotations preserved
  expect(result).toContain("i.string<'todo' | 'in_progress' | 'done'>()");
  expect(result).toContain('i.number<1 | 2 | 3>()');
  expect(result).toContain('i.json<Label[]>()');
  expect(result).toContain('i.json<{ x: number; y: number }>()');

  // Import preserved
  expect(result).toContain("import { Label } from './types';");
});

test('preserves different import styles', () => {
  const oldFile = `
import { i } from '@instantdb/core';
import { Label } from './types';
import { Tag as MyTag } from './types';
import Priority from './Priority';
import * as Models from './models';
import type { Meta } from './meta';

const _schema = i.schema({
  entities: {
    a: i.entity({ f: i.json<Label>() }),
    b: i.entity({ f: i.json<MyTag>() }),
    c: i.entity({ f: i.json<Priority>() }),
    d: i.entity({ f: i.json<Models.Status>() }),
    e: i.entity({ f: i.json<Meta>() }),
  },
});
`;

  const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    a: i.entity({ f: i.json() }),
    b: i.entity({ f: i.json() }),
    c: i.entity({ f: i.json() }),
    d: i.entity({ f: i.json() }),
    e: i.entity({ f: i.json() }),
  },
});
`;

  const result = mergeSchema(oldFile, newFile);

  // All import styles preserved (named imports from same module are combined)
  expect(result).toContain('Label');
  expect(result).toContain('Tag as MyTag');
  expect(result).toContain("import Priority from './Priority';");
  expect(result).toContain("import * as Models from './models';");
  expect(result).toContain("import type { Meta } from './meta';");

  // Type annotations preserved
  expect(result).toContain('i.json<Label>()');
  expect(result).toContain('i.json<MyTag>()');
  expect(result).toContain('i.json<Priority>()');
  expect(result).toContain('i.json<Models.Status>()');
  expect(result).toContain('i.json<Meta>()');
});

test('handles entity additions and removals', () => {
  const oldFile = `
import { i } from '@instantdb/core';
import { Label } from './types';

const _schema = i.schema({
  entities: {
    todos: i.entity({
      labels: i.json<Label[]>(),
    }),
    oldEntity: i.entity({
      data: i.json<{ removed: true }>(),
    }),
  },
});
`;

  const newFile = `
import { i } from '@instantdb/core';
import { Label } from './types';

const _schema = i.schema({
  entities: {
    todos: i.entity({
      labels: i.json(),
    }),
    newEntity: i.entity({
      data: i.json(),
    }),
  },
});
`;

  const result = mergeSchema(oldFile, newFile);

  // Existing entity type preserved
  expect(result).toContain('i.json<Label[]>()');

  // Removed entity is gone
  expect(result).not.toContain('oldEntity');

  // New entity has no type annotation
  expect(result).toContain('newEntity: i.entity({');
  expect(result).not.toContain('i.json<{ removed: true }>()');

  // Import not duplicated (was already in newFile)
  const importMatches = result.match(/import { Label } from '\.\/types';/g);
  expect(importMatches?.length).toBe(1);
});

import { describe, test, expect } from 'vitest';
import { mergeSchema } from '../src/util/mergeSchema';

describe('mergeSchema', () => {
  test('preserves entity types', () => {
    const oldFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    users: i.entity<{ name: string; age: number }>({
      name: i.string(),
      age: i.number(),
    }),
  },
});
`;
    const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    users: i.entity({
      name: i.string(),
      age: i.number(),
    }),
  },
});
`;

    const result = mergeSchema(oldFile, newFile);
    expect(result).toContain('i.entity<{ name: string; age: number }>');
  });

  test('preserves imports used in types', () => {
    const oldFile = `
import { i } from '@instantdb/core';
import { User } from './types';

const _schema = i.schema({
  entities: {
    users: i.entity<User>({
      name: i.string(),
    }),
  },
});
`;
    const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    users: i.entity({
      name: i.string(),
    }),
  },
});
`;

    const result = mergeSchema(oldFile, newFile);
    expect(result).toContain("import { User } from './types';");
    expect(result).toContain('i.entity<User>');
  });

  test('preserves renamed imports', () => {
    const oldFile = `
import { i } from '@instantdb/core';
import { User as MyUser } from './types';

const _schema = i.schema({
  entities: {
    users: i.entity<MyUser>({
      name: i.string(),
    }),
  },
});
`;
    const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    users: i.entity({
      name: i.string(),
    }),
  },
});
`;

    const result = mergeSchema(oldFile, newFile);
    expect(result).toContain("import { User as MyUser } from './types';");
    expect(result).toContain('i.entity<MyUser>');
  });

  test('does not duplicate existing imports', () => {
    const oldFile = `
import { i } from '@instantdb/core';
import { User } from './types';

const _schema = i.schema({
  entities: {
    users: i.entity<User>({
      name: i.string(),
    }),
  },
});
`;
    const newFile = `
import { i } from '@instantdb/core';
import { User } from './types';

const _schema = i.schema({
  entities: {
    users: i.entity({
      name: i.string(),
    }),
  },
});
`;

    const result = mergeSchema(oldFile, newFile);
    // Should not have two import lines for User
    const matches = result.match(/import { User } from '\.\/types';/g);
    expect(matches?.length).toBe(1);
    expect(result).toContain('i.entity<User>');
  });

  test('handles new entities (no type preservation)', () => {
    const oldFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {},
});
`;
    const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
    }),
  },
});
`;

    const result = mergeSchema(oldFile, newFile);
    expect(result).toContain('posts: i.entity({');
    expect(result).not.toContain('posts: i.entity<');
  });

  test('handles removed entities', () => {
    const oldFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    users: i.entity<{ name: string }>({
      name: i.string(),
    }),
  },
});
`;
    const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {},
});
`;

    const result = mergeSchema(oldFile, newFile);
    expect(result).not.toContain('users:');
  });

  test('preserves types in nested objects', () => {
    // Assuming i.entity can be nested or used in a structure that traverseSchema supports
    // traverseSchema goes into ObjectExpression properties.
    const oldFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    auth: {
      users: i.entity<{ id: string }>({
        id: i.string(),
      }),
    },
  },
});
`;
    const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    auth: {
      users: i.entity({
        id: i.string(),
      }),
    },
  },
});
`;

    const result = mergeSchema(oldFile, newFile);
    expect(result).toContain('i.entity<{ id: string }>');
  });

  test('preserves default imports', () => {
    const oldFile = `
import { i } from '@instantdb/core';
import User from './User';

const _schema = i.schema({
  entities: {
    users: i.entity<User>({
      name: i.string(),
    }),
  },
});
`;
    const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    users: i.entity({
      name: i.string(),
    }),
  },
});
`;
    const result = mergeSchema(oldFile, newFile);
    expect(result).toContain("import User from './User';");
    expect(result).toContain('i.entity<User>');
  });

  test('preserves namespace imports', () => {
    const oldFile = `
import { i } from '@instantdb/core';
import * as Types from './types';

const _schema = i.schema({
  entities: {
    users: i.entity<Types.User>({
      name: i.string(),
    }),
  },
});
`;
    const newFile = `
import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    users: i.entity({
      name: i.string(),
    }),
  },
});
`;
    const result = mergeSchema(oldFile, newFile);
    expect(result).toContain("import * as Types from './types';");
    expect(result).toContain('i.entity<Types.User>');
  });
});

import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  runCli,
  createTestProject,
  createTempApp,
  adminTransact,
  createAppUser,
} from './helpers';

const SCHEMA_FILE = `
import { i } from "@instantdb/core";

const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
      body: i.string(),
    }),
    comments: i.entity({
      text: i.string(),
    }),
  },
  links: {
    postComments: {
      forward: { on: "posts", has: "many", label: "comments" },
      reverse: { on: "comments", has: "one", label: "post" },
    },
  },
});

export default _schema;
`;

const PERMS_FILE = `export default {
  posts: { allow: { view: "true", create: "true" } },
};
`;

describe.concurrent('CLI e2e', { timeout: 30_000 }, () => {
  describe('init-without-files', () => {
    it('creates a temp app and outputs JSON', async () => {
      const result = await runCli([
        'init-without-files',
        '--title',
        'e2e-temp-test',
        '--temp',
      ]);

      expect(result.exitCode).toBe(0);

      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();

      const parsed = JSON.parse(jsonMatch![0]);
      expect(parsed.app).toBeTruthy();
      expect(parsed.app.appId).toBeTruthy();
      expect(parsed.app.adminToken).toBeTruthy();
      expect(parsed.error).toBeNull();
    });

    it('fails without --title', async () => {
      const result = await runCli(['init-without-files', '--temp']);
      expect(result.exitCode).not.toBe(0);
    });

    it('fails when title value looks like a flag', async () => {
      const result = await runCli([
        'init-without-files',
        '--title',
        '--bad-title',
      ]);

      expect(result.exitCode).not.toBe(0);
    });

    it('outputs JSON error format on failure', async () => {
      const result = await runCli(['init-without-files', '--title', 'test']);

      const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
      expect(jsonMatch).toBeTruthy();

      const parsed = JSON.parse(jsonMatch![0]);
      expect(parsed.app).toBeNull();
      expect(parsed.error).toHaveProperty('message');
    });

    it('rejects --temp with --org-id', async () => {
      const result = await runCli([
        'init-without-files',
        '--title',
        'test',
        '--temp',
        '--org-id',
        'org-1',
      ]);

      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toMatch(/cannot.*--temp.*--org-id|cannot.*together/i);
    });
  });

  describe('push schema', () => {
    it('pushes schema to a real app', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        appId,
        schemaFile: SCHEMA_FILE,
      });

      try {
        const result = await runCli(['push', 'schema', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toContain('posts');
      } finally {
        await project.cleanup();
      }
    });

    it('reports no changes on second push', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        appId,
        schemaFile: SCHEMA_FILE,
      });

      try {
        await runCli(['push', 'schema', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        const result = await runCli(['push', 'schema', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).toBe(0);
        const output = result.stdout + result.stderr;
        expect(output.toLowerCase()).toMatch(/no.*change/);
      } finally {
        await project.cleanup();
      }
    });

    it('works with --app flag instead of env var', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        schemaFile: SCHEMA_FILE,
      });

      try {
        const result = await runCli(
          ['push', 'schema', '--app', appId, '--yes'],
          {
            cwd: project.dir,
            env: { INSTANT_CLI_AUTH_TOKEN: adminToken },
          },
        );

        expect(result.exitCode).toBe(0);
      } finally {
        await project.cleanup();
      }
    });
  });

  describe('push schema with --rename', () => {
    it('renames an attribute', async () => {
      const { appId, adminToken } = await createTempApp();

      const initialSchema = `
import { i } from "@instantdb/core";
const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
      body: i.string(),
    }),
  },
});
export default _schema;
`;

      const renamedSchema = `
import { i } from "@instantdb/core";
const _schema = i.schema({
  entities: {
    posts: i.entity({
      name: i.string(),
      body: i.string(),
    }),
  },
});
export default _schema;
`;

      const project1 = await createTestProject({
        appId,
        schemaFile: initialSchema,
      });
      const seedResult = await runCli(['push', 'schema', '--yes'], {
        cwd: project1.dir,
        env: {
          INSTANT_CLI_AUTH_TOKEN: adminToken,
          INSTANT_APP_ID: appId,
        },
      });
      expect(seedResult.exitCode).toBe(0);
      await project1.cleanup();

      const project2 = await createTestProject({
        appId,
        schemaFile: renamedSchema,
      });

      try {
        const result = await runCli(
          ['push', 'schema', '--yes', '--rename', 'posts.title:posts.name'],
          {
            cwd: project2.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );

        expect(result.exitCode).toBe(0);

        // Pull and verify the rename took effect
        const pullProject = await createTestProject({ appId });
        await runCli(['pull', 'schema', '--yes'], {
          cwd: pullProject.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        const pulled = await readFile(
          join(pullProject.dir, 'instant.schema.ts'),
          'utf-8',
        );
        expect(pulled).toContain('name: i.string()');
        expect(pulled).toContain('body: i.string()');
        expect(pulled).not.toContain('title: i.string()');
        await pullProject.cleanup();
      } finally {
        await project2.cleanup();
      }
    });
  });

  describe('push perms', () => {
    it('succeeds gracefully when no perms file exists', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({ appId });

      try {
        const result = await runCli(['push', 'perms', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).toBe(0);
      } finally {
        await project.cleanup();
      }
    });

    it('pushes perms to a real app', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        appId,
        permsFile: PERMS_FILE,
      });

      try {
        const result = await runCli(['push', 'perms', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).toBe(0);
      } finally {
        await project.cleanup();
      }
    });
  });

  describe('push all', () => {
    it('pushes both schema and perms', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        appId,
        schemaFile: SCHEMA_FILE,
        permsFile: PERMS_FILE,
      });

      try {
        const result = await runCli(['push', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).toBe(0);
      } finally {
        await project.cleanup();
      }
    });
  });

  describe('pull', () => {
    it('pulls schema from app with no user-defined entities', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({ appId });

      try {
        const result = await runCli(['pull', 'schema', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).toBe(0);

        const schemaContent = await readFile(
          join(project.dir, 'instant.schema.ts'),
          'utf-8',
        );
        expect(schemaContent).toContain('i.schema');
        expect(schemaContent).not.toContain('posts');
      } finally {
        await project.cleanup();
      }
    });
  });

  describe('schema roundtrip', () => {
    it('push then pull produces matching schema', async () => {
      const { appId, adminToken } = await createTempApp();
      const pushProject = await createTestProject({
        appId,
        schemaFile: SCHEMA_FILE,
      });
      const pushResult = await runCli(['push', 'schema', '--yes'], {
        cwd: pushProject.dir,
        env: {
          INSTANT_CLI_AUTH_TOKEN: adminToken,
          INSTANT_APP_ID: appId,
        },
      });
      expect(pushResult.exitCode).toBe(0);
      await pushProject.cleanup();

      const project = await createTestProject({ appId });

      try {
        const pullResult = await runCli(['pull', 'schema', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });
        expect(pullResult.exitCode).toBe(0);

        const pulled = await readFile(
          join(project.dir, 'instant.schema.ts'),
          'utf-8',
        );

        expect(pulled).toContain('posts');
        expect(pulled).toContain('comments');
        expect(pulled).toContain('title: i.string()');
        expect(pulled).toContain('body: i.string()');
        expect(pulled).toContain('text: i.string()');
        expect(pulled).toContain('postsComments');
      } finally {
        await project.cleanup();
      }
    });
  });

  describe('perms roundtrip', () => {
    it('push then pull produces matching perms', async () => {
      const { appId, adminToken } = await createTempApp();
      const pushProject = await createTestProject({
        appId,
        permsFile: PERMS_FILE,
      });
      const pushResult = await runCli(['push', 'perms', '--yes'], {
        cwd: pushProject.dir,
        env: {
          INSTANT_CLI_AUTH_TOKEN: adminToken,
          INSTANT_APP_ID: appId,
        },
      });
      expect(pushResult.exitCode).toBe(0);
      await pushProject.cleanup();

      const project = await createTestProject({ appId });

      try {
        await runCli(['pull', 'perms', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        const pulled = await readFile(
          join(project.dir, 'instant.perms.ts'),
          'utf-8',
        );
        expect(pulled).toContain('posts');
        expect(pulled).toContain('view');
        expect(pulled).toContain('"true"');
        expect(pulled).toContain('create');
      } finally {
        await project.cleanup();
      }
    });
  });

  describe('pull all', () => {
    it('pulls both schema and perms', async () => {
      const { appId, adminToken } = await createTempApp();
      const pushProject = await createTestProject({
        appId,
        schemaFile: SCHEMA_FILE,
        permsFile: PERMS_FILE,
      });
      const pushResult = await runCli(['push', '--yes'], {
        cwd: pushProject.dir,
        env: {
          INSTANT_CLI_AUTH_TOKEN: adminToken,
          INSTANT_APP_ID: appId,
        },
      });
      expect(pushResult.exitCode).toBe(0);
      await pushProject.cleanup();

      const project = await createTestProject({ appId });

      try {
        const result = await runCli(['pull', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).toBe(0);

        const schemaContent = await readFile(
          join(project.dir, 'instant.schema.ts'),
          'utf-8',
        );
        expect(schemaContent).toContain('posts');

        const permsContent = await readFile(
          join(project.dir, 'instant.perms.ts'),
          'utf-8',
        );
        expect(permsContent).toContain('posts');
      } finally {
        await project.cleanup();
      }
    });
  });

  describe('query', () => {
    it('queries data from an app', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        appId,
        schemaFile: SCHEMA_FILE,
      });

      try {
        const pushResult = await runCli(['push', 'schema', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });
        expect(pushResult.exitCode).toBe(0);

        await adminTransact(appId, adminToken, [
          ['update', 'posts', randomUUID(), { title: 'Hello', body: 'World' }],
          ['update', 'posts', randomUUID(), { title: 'Second', body: 'Post' }],
        ]);

        const result = await runCli(
          ['query', '--admin', JSON.stringify({ posts: {} })],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );

        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.posts).toHaveLength(2);
        expect(data.posts.map((p: any) => p.title).sort()).toEqual([
          'Hello',
          'Second',
        ]);
      } finally {
        await project.cleanup();
      }
    });

    it('queries with filters', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        appId,
        schemaFile: SCHEMA_FILE,
      });

      try {
        const pushResult = await runCli(['push', 'schema', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });
        expect(pushResult.exitCode).toBe(0);

        await adminTransact(appId, adminToken, [
          ['update', 'posts', randomUUID(), { title: 'Match', body: 'Yes' }],
          ['update', 'posts', randomUUID(), { title: 'Nope', body: 'No' }],
        ]);

        const query = {
          posts: { $: { where: { title: 'Match' } } },
        };
        const result = await runCli(
          ['query', '--admin', JSON.stringify(query)],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );

        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.posts).toHaveLength(1);
        expect(data.posts[0].title).toBe('Match');
      } finally {
        await project.cleanup();
      }
    });

    it('returns empty arrays for entities with no data', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        appId,
        schemaFile: SCHEMA_FILE,
      });

      try {
        const pushResult = await runCli(['push', 'schema', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });
        expect(pushResult.exitCode).toBe(0);

        const result = await runCli(
          ['query', '--admin', JSON.stringify({ posts: {} })],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );

        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.posts).toEqual([]);
      } finally {
        await project.cleanup();
      }
    });

    it('works with --app flag', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        schemaFile: SCHEMA_FILE,
      });

      try {
        const pushResult = await runCli(
          ['push', 'schema', '--app', appId, '--yes'],
          {
            cwd: project.dir,
            env: { INSTANT_CLI_AUTH_TOKEN: adminToken },
          },
        );
        expect(pushResult.exitCode).toBe(0);

        const result = await runCli(
          ['query', '--admin', '--app', appId, JSON.stringify({ posts: {} })],
          {
            cwd: project.dir,
            env: { INSTANT_CLI_AUTH_TOKEN: adminToken },
          },
        );

        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.posts).toEqual([]);
      } finally {
        await project.cleanup();
      }
    });

    it('fails with invalid JSON', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({ appId });

      try {
        const result = await runCli(['query', '--admin', 'not valid json'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).not.toBe(0);
      } finally {
        await project.cleanup();
      }
    });

    it('accepts JSON5 syntax (unquoted keys)', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({ appId });

      try {
        const result = await runCli(['query', '--admin', '{ $users: {} }'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.$users).toEqual([]);
      } finally {
        await project.cleanup();
      }
    });

    it('fails without context flag', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({ appId });

      try {
        const result = await runCli(['query', JSON.stringify({ posts: {} })], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });

        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/--admin|--as-email|--as-guest/);
      } finally {
        await project.cleanup();
      }
    });

    it('fails with multiple context flags', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({ appId });

      try {
        const result = await runCli(
          [
            'query',
            '--as-email',
            'alice@example.com',
            '--as-guest',
            JSON.stringify({ posts: {} }),
          ],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );

        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/exactly one context/);
      } finally {
        await project.cleanup();
      }
    });

    it('fails without auth', async () => {
      const { appId } = await createTempApp();
      const project = await createTestProject({ appId });

      try {
        const result = await runCli(
          ['query', '--admin', JSON.stringify({ posts: {} })],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: '',
              INSTANT_APP_ADMIN_TOKEN: '',
              INSTANT_ADMIN_TOKEN: '',
              INSTANT_APP_ID: appId,
            },
          },
        );

        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/not logged in/i);
      } finally {
        await project.cleanup();
      }
    });

    it('queries nested associations', async () => {
      const { appId, adminToken } = await createTempApp();
      const project = await createTestProject({
        appId,
        schemaFile: SCHEMA_FILE,
      });

      try {
        const pushResult = await runCli(['push', 'schema', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });
        expect(pushResult.exitCode).toBe(0);

        const postId = randomUUID();
        const commentId = randomUUID();
        await adminTransact(appId, adminToken, [
          ['update', 'posts', postId, { title: 'My Post', body: 'Content' }],
          ['update', 'comments', commentId, { text: 'Great post!' }],
          ['link', 'posts', postId, { comments: commentId }],
        ]);

        const result = await runCli(
          ['query', '--admin', JSON.stringify({ posts: { comments: {} } })],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );

        expect(result.exitCode).toBe(0);
        const data = JSON.parse(result.stdout);
        expect(data.posts).toHaveLength(1);
        expect(data.posts[0].comments).toHaveLength(1);
        expect(data.posts[0].comments[0].text).toBe('Great post!');
      } finally {
        await project.cleanup();
      }
    });

    it('--as-email runs query as a specific user with perms applied', async () => {
      const { appId, adminToken } = await createTempApp();

      const schemaWithCreator = `
import { i } from "@instantdb/core";
const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
      creatorEmail: i.string(),
    }),
  },
});
export default _schema;
`;

      // Only allow users to view posts they created
      const restrictedPerms = `export default {
  posts: {
    allow: {
      view: "auth.email == data.creatorEmail",
    },
  },
};
`;

      const project = await createTestProject({
        appId,
        schemaFile: schemaWithCreator,
        permsFile: restrictedPerms,
      });

      try {
        const pushResult = await runCli(['push', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });
        expect(pushResult.exitCode).toBe(0);

        await createAppUser(appId, adminToken, 'alice@test.com');
        await createAppUser(appId, adminToken, 'bob@test.com');

        await adminTransact(appId, adminToken, [
          [
            'update',
            'posts',
            randomUUID(),
            { title: "Alice's Post", creatorEmail: 'alice@test.com' },
          ],
          [
            'update',
            'posts',
            randomUUID(),
            { title: "Bob's Post", creatorEmail: 'bob@test.com' },
          ],
        ]);

        // Admin sees all posts
        const adminResult = await runCli(
          ['query', '--admin', JSON.stringify({ posts: {} })],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );
        expect(adminResult.exitCode).toBe(0);
        const adminData = JSON.parse(adminResult.stdout);
        expect(adminData.posts).toHaveLength(2);

        // Alice only sees her post
        const aliceResult = await runCli(
          [
            'query',
            '--as-email',
            'alice@test.com',
            JSON.stringify({ posts: {} }),
          ],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );
        expect(aliceResult.exitCode).toBe(0);
        const aliceData = JSON.parse(aliceResult.stdout);
        expect(aliceData.posts).toHaveLength(1);
        expect(aliceData.posts[0].title).toBe("Alice's Post");

        // Bob only sees his post
        const bobResult = await runCli(
          [
            'query',
            '--as-email',
            'bob@test.com',
            JSON.stringify({ posts: {} }),
          ],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );
        expect(bobResult.exitCode).toBe(0);
        const bobData = JSON.parse(bobResult.stdout);
        expect(bobData.posts).toHaveLength(1);
        expect(bobData.posts[0].title).toBe("Bob's Post");
      } finally {
        await project.cleanup();
      }
    });

    it('--as-guest runs query as unauthenticated user', async () => {
      const { appId, adminToken } = await createTempApp();

      // Guests can only see posts marked as public
      const schemaWithVisibility = `
import { i } from "@instantdb/core";
const _schema = i.schema({
  entities: {
    posts: i.entity({
      title: i.string(),
      isPublic: i.boolean(),
    }),
  },
});
export default _schema;
`;

      const guestPerms = `export default {
  posts: {
    allow: {
      view: "data.isPublic == true",
    },
  },
};
`;

      const project = await createTestProject({
        appId,
        schemaFile: schemaWithVisibility,
        permsFile: guestPerms,
      });

      try {
        const pushResult = await runCli(['push', '--yes'], {
          cwd: project.dir,
          env: {
            INSTANT_CLI_AUTH_TOKEN: adminToken,
            INSTANT_APP_ID: appId,
          },
        });
        expect(pushResult.exitCode).toBe(0);

        await adminTransact(appId, adminToken, [
          [
            'update',
            'posts',
            randomUUID(),
            { title: 'Public Post', isPublic: true },
          ],
          [
            'update',
            'posts',
            randomUUID(),
            { title: 'Private Post', isPublic: false },
          ],
        ]);

        // Admin sees both
        const adminResult = await runCli(
          ['query', '--admin', JSON.stringify({ posts: {} })],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );
        expect(adminResult.exitCode).toBe(0);
        const adminData = JSON.parse(adminResult.stdout);
        expect(adminData.posts).toHaveLength(2);

        // Guest only sees public post
        const guestResult = await runCli(
          ['query', '--as-guest', JSON.stringify({ posts: {} })],
          {
            cwd: project.dir,
            env: {
              INSTANT_CLI_AUTH_TOKEN: adminToken,
              INSTANT_APP_ID: appId,
            },
          },
        );
        expect(guestResult.exitCode).toBe(0);
        const guestData = JSON.parse(guestResult.stdout);
        expect(guestData.posts).toHaveLength(1);
        expect(guestData.posts[0].title).toBe('Public Post');
      } finally {
        await project.cleanup();
      }
    });
  });

  describe('info', () => {
    it('shows version', async () => {
      const result = await runCli(['info']);

      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/version/i);
    });

    it('shows not logged in without token', async () => {
      const result = await runCli(['info'], {
        env: { INSTANT_CLI_AUTH_TOKEN: '' },
      });

      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/not logged in/);
    });
  });

  describe('logout', () => {
    it('prints logged out message', async () => {
      const result = await runCli(['logout']);

      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/logged out/);
    });
  });

  describe('claim', () => {
    it('fails when not logged in', async () => {
      const result = await runCli(['claim'], {
        env: {
          INSTANT_CLI_AUTH_TOKEN: '',
          INSTANT_APP_ID: 'fake-app-id',
          INSTANT_APP_ADMIN_TOKEN: 'fake-token',
        },
      });

      expect(result.exitCode).not.toBe(0);
    });

    it('fails when no app ID in env', async () => {
      const result = await runCli(['claim'], {
        env: {
          INSTANT_CLI_AUTH_TOKEN: 'some-token',
          INSTANT_APP_ID: '',
          INSTANT_APP_ADMIN_TOKEN: '',
        },
      });

      expect(result.exitCode).not.toBe(0);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { readFile, readdir, access } from 'fs/promises';
import { join } from 'path';
import { runCreateInstantApp, createTestDir } from './helpers.js';

describe.concurrent('create-instant-app e2e', { timeout: 120_000 }, () => {
  describe('basic scaffolding (next-js-app-dir default)', () => {
    it('scaffolds a project with default template', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(['my-test-app', '--yes'], {
          cwd: t.dir,
        });

        expect(result.exitCode).toBe(0);

        const projectDir = join(t.dir, 'my-test-app');
        const files = await readdir(projectDir);
        expect(files).toContain('package.json');
        expect(files).toContain('.gitignore');

        const pkgJson = JSON.parse(
          await readFile(join(projectDir, 'package.json'), 'utf-8'),
        );
        expect(pkgJson.name).toBe('my-test-app');
      } finally {
        await t.cleanup();
      }
    });

    it('creates .env file with INSTANT_APP_ID', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(['env-test-app', '--yes'], {
          cwd: t.dir,
        });

        expect(result.exitCode).toBe(0);

        const projectDir = join(t.dir, 'env-test-app');
        const envContents = await readFile(join(projectDir, '.env'), 'utf-8');
        expect(envContents).toMatch(/INSTANT_APP_ID=.+/);
      } finally {
        await t.cleanup();
      }
    });

    it('includes CLAUDE.md and git repo by default', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(['rules-test-app', '--yes'], {
          cwd: t.dir,
        });

        expect(result.exitCode).toBe(0);

        const projectDir = join(t.dir, 'rules-test-app');
        await expect(
          access(join(projectDir, 'CLAUDE.md')),
        ).resolves.toBeUndefined();
        await expect(access(join(projectDir, '.git'))).resolves.toBeUndefined();
      } finally {
        await t.cleanup();
      }
    });
  });

  describe('--no-git', () => {
    it('skips git initialization', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(
          ['no-git-app', '--no-git', '--yes'],
          {
            cwd: t.dir,
          },
        );

        expect(result.exitCode).toBe(0);

        const projectDir = join(t.dir, 'no-git-app');
        await expect(access(join(projectDir, '.git'))).rejects.toThrow();
      } finally {
        await t.cleanup();
      }
    });
  });

  describe('template selection via flags', () => {
    it('scaffolds with --vanilla flag', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(
          ['vanilla-app', '--vanilla', '--yes'],
          {
            cwd: t.dir,
          },
        );

        expect(result.exitCode).toBe(0);

        const projectDir = join(t.dir, 'vanilla-app');
        const files = await readdir(projectDir);
        expect(files).toContain('package.json');
      } finally {
        await t.cleanup();
      }
    });

    it('scaffolds with --base flag', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(
          ['base-app', '--base', 'vite-vanilla', '--yes'],
          { cwd: t.dir },
        );

        expect(result.exitCode).toBe(0);

        const projectDir = join(t.dir, 'base-app');
        const pkgJson = JSON.parse(
          await readFile(join(projectDir, 'package.json'), 'utf-8'),
        );
        expect(pkgJson.name).toBe('base-app');
      } finally {
        await t.cleanup();
      }
    });

    it('scaffolds with --vite-react flag', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(
          ['vite-react-app', '--vite-react', '--yes'],
          { cwd: t.dir },
        );

        expect(result.exitCode).toBe(0);

        const projectDir = join(t.dir, 'vite-react-app');
        await expect(
          access(join(projectDir, 'vite.config.ts')),
        ).resolves.toBeUndefined();
        await expect(
          access(join(projectDir, 'src', 'App.tsx')),
        ).resolves.toBeUndefined();

        const envContents = await readFile(join(projectDir, '.env'), 'utf-8');
        expect(envContents).toMatch(/VITE_INSTANT_APP_ID=.+/);
      } finally {
        await t.cleanup();
      }
    });
  });

  describe('rule file flags', () => {
    it('scaffolds with --cursor flag', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(
          ['cursor-app', '--cursor', '--yes'],
          {
            cwd: t.dir,
          },
        );

        expect(result.exitCode).toBe(0);

        const projectDir = join(t.dir, 'cursor-app');
        await expect(
          access(join(projectDir, '.cursor', 'rules', 'instant.mdc')),
        ).resolves.toBeUndefined();
      } finally {
        await t.cleanup();
      }
    });

    it('scaffolds with --codex flag', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(
          ['codex-app', '--codex', '--yes'],
          {
            cwd: t.dir,
          },
        );

        expect(result.exitCode).toBe(0);

        const projectDir = join(t.dir, 'codex-app');
        await expect(
          access(join(projectDir, 'AGENTS.md')),
        ).resolves.toBeUndefined();
      } finally {
        await t.cleanup();
      }
    });
  });

  describe('error cases', () => {
    it('fails with --yes but no project name', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(['--yes'], {
          cwd: t.dir,
        });

        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/must specify a project name/i);
      } finally {
        await t.cleanup();
      }
    });

    it('fails with --yes and --ai', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(['ai-app', '--ai', '--yes'], {
          cwd: t.dir,
        });

        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/--yes.*not supported.*--ai/i);
      } finally {
        await t.cleanup();
      }
    });
  });

  describe('app linking with --app and --token', () => {
    it('fails with --app but no login or --token', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(
          ['linked-app', '--yes', '--app', 'fake-app-id'],
          { cwd: t.dir },
        );

        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/logged in|--token/i);
      } finally {
        await t.cleanup();
      }
    });

    it('fails with invalid --app and --token combination', async () => {
      const t = await createTestDir();
      try {
        const result = await runCreateInstantApp(
          [
            'linked-app',
            '--yes',
            '--app',
            'fake-app-id',
            '--token',
            'fake-token',
          ],
          { cwd: t.dir },
        );

        expect(result.exitCode).not.toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toMatch(/invalid/i);
      } finally {
        await t.cleanup();
      }
    });
  });
});

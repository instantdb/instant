import { execFile } from 'child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = join(__dirname, '../..');
const CORE_DIR = join(CLI_DIR, '../core');
const PLATFORM_DIR = join(CLI_DIR, '../platform');
const VERSION_DIR = join(CLI_DIR, '../version');

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

function run(
  command: string,
  args: string[],
  opts: { cwd: string; timeout?: number },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeout ?? 60_000,
        env: {
          ...process.env,
          COREPACK_ENABLE_AUTO_PIN: '0',
        },
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          exitCode: error
            ? typeof error.code === 'number'
              ? error.code
              : 1
            : 0,
        });
      },
    );
  });
}

async function packCli(packDir: string) {
  const result = await run('pnpm', ['pack', '--pack-destination', packDir], {
    cwd: CLI_DIR,
  });
  expect(result.exitCode, result.stderr || result.stdout).toBe(0);

  const files = await readdir(packDir);
  const tarball = files.find((file) => file.endsWith('.tgz'));
  expect(tarball).toBeTruthy();

  return join(packDir, tarball!);
}

describe('packaged CLI module resolution', { timeout: 120_000 }, () => {
  it('starts without Effect cluster peer packages installed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'instant-cli-package-'));

    try {
      const packDir = join(root, 'pack');
      const projectDir = join(root, 'project');
      await mkdir(packDir);
      await mkdir(projectDir);

      const tarball = await packCli(packDir);

      await writeFile(
        join(projectDir, 'package.json'),
        JSON.stringify(
          {
            name: 'instant-cli-package-resolution',
            private: true,
            dependencies: {
              'instant-cli': `file:${tarball}`,
            },
            pnpm: {
              overrides: {
                '@instantdb/core': `link:${CORE_DIR}`,
                '@instantdb/platform': `link:${PLATFORM_DIR}`,
                '@instantdb/version': `link:${VERSION_DIR}`,
              },
            },
          },
          null,
          2,
        ),
      );

      const install = await run(
        'pnpm',
        [
          'install',
          '--prod',
          '--ignore-scripts',
          '--config.auto-install-peers=false',
          '--config.strict-peer-dependencies=false',
        ],
        { cwd: projectDir },
      );
      expect(install.exitCode, install.stderr || install.stdout).toBe(0);

      const result = await run('pnpm', ['exec', 'instant-cli', '--version'], {
        cwd: projectDir,
      });

      expect(result.exitCode, result.stderr || result.stdout).toBe(0);
      expect(result.stdout.trim()).toMatch(/^v\d+\.\d+\.\d+/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

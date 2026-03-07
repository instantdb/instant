import { execFile } from 'child_process';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = join(__dirname, '../../bin/index.js');

const apiUrl = process.env.INSTANT_CLI_API_URI || 'https://api.instantdb.com';

export type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export function runCli(
  args: string[],
  opts: {
    env?: Record<string, string>;
    cwd?: string;
  } = {},
): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_BIN, ...args],
      {
        env: {
          ...process.env,
          INSTANT_CLI_API_URI: apiUrl,
          DOTENV_CONFIG_PATH: '/dev/null',
          INSTANT_CLI_AUTH_TOKEN: '',
          ...opts.env,
        },
        cwd: opts.cwd,
        timeout: 30_000,
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

export type TestProject = {
  dir: string;
  cleanup: () => Promise<void>;
};

export async function createTestProject(
  opts: {
    appId?: string;
    schemaFile?: string;
    permsFile?: string;
  } = {},
): Promise<TestProject> {
  const dir = await mkdtemp(join(tmpdir(), 'instant-cli-e2e-'));

  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'e2e-test-project',
        version: '1.0.0',
        dependencies: { '@instantdb/react': '^0.0.1' },
      },
      null,
      2,
    ),
  );

  await mkdir(join(dir, 'node_modules', '@instantdb', 'react'), {
    recursive: true,
  });
  await writeFile(
    join(dir, 'node_modules', '@instantdb', 'react', 'package.json'),
    JSON.stringify({ name: '@instantdb/react', version: '0.0.1' }),
  );

  if (opts.appId) {
    await writeFile(join(dir, '.env'), `INSTANT_APP_ID=${opts.appId}\n`);
  }

  if (opts.schemaFile) {
    await writeFile(join(dir, 'instant.schema.ts'), opts.schemaFile);
  }

  if (opts.permsFile) {
    await writeFile(join(dir, 'instant.perms.ts'), opts.permsFile);
  }

  return {
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function createTempApp(title = 'cli-e2e-test'): Promise<{
  appId: string;
  adminToken: string;
}> {
  const response = await fetch(`${apiUrl}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to create ephemeral app: ${response.status} ${await response.text()}`,
    );
  }
  const { app } = await response.json();
  return { appId: app.id, adminToken: app['admin-token'] };
}

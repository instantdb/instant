import { execFile } from 'child_process';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = join(__dirname, '../../dist/new/index.js');

const apiUrl = process.env.INSTANT_CLI_API_URI || 'https://api.instantdb.com';

// Temp directory used to sandbox CLI config (auth tokens, etc.)
// so tests never read or mutate the real user config on disk.
const sandboxHome = join(tmpdir(), 'instant-cli-e2e-home');

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
          HOME: sandboxHome,
          XDG_CONFIG_HOME: join(sandboxHome, '.config'),
          XDG_DATA_HOME: join(sandboxHome, '.local', 'share'),
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

export async function adminTransact(
  appId: string,
  adminToken: string,
  steps: any[],
): Promise<void> {
  const response = await fetch(`${apiUrl}/admin/transact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'app-id': appId,
    },
    body: JSON.stringify({ steps }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to transact: ${response.status} ${await response.text()}`,
    );
  }
}

export async function createAppUser(
  appId: string,
  adminToken: string,
  email: string,
): Promise<{ userId: string; refreshToken: string }> {
  const response = await fetch(`${apiUrl}/admin/refresh_tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
      'app-id': appId,
    },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to create user: ${response.status} ${await response.text()}`,
    );
  }
  const data = await response.json();
  return { userId: data.user.id, refreshToken: data.user.refresh_token };
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

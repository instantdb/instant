import { execFile } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '../../dist/index.js');

const sandboxHomeDir = join(tmpdir(), 'create-instant-app-e2e-home');

export type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Run `create-instant-app` with the given args inside a fresh temp directory.
 */
export function runCreateInstantApp(
  args: string[],
  opts: {
    env?: Record<string, string>;
    cwd?: string;
    timeout?: number;
  } = {},
): Promise<CliResult> {
  const finalArgs = args;

  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [BIN, ...finalArgs],
      {
        env: {
          ...process.env,
          // Prevent reading real auth / dotenv
          DOTENV_CONFIG_PATH: '/dev/null',
          INSTANT_CLI_AUTH_TOKEN: '',
          HOME: sandboxHomeDir,
          XDG_CONFIG_HOME: join(sandboxHomeDir, '.config'),
          XDG_DATA_HOME: join(sandboxHomeDir, '.local', 'share'),
          // Don't open browser
          BROWSER: 'echo',
          ...opts.env,
        },
        cwd: opts.cwd,
        timeout: opts.timeout ?? 120_000,
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

export type TestDir = {
  dir: string;
  cleanup: () => Promise<void>;
};

/**
 * Create a temporary directory to run `create-instant-app` in.
 * The scaffolded project will appear as a subdirectory inside `dir`.
 */
export async function createTestDir(): Promise<TestDir> {
  const dir = await mkdtemp(join(tmpdir(), 'cia-e2e-'));
  return {
    dir,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

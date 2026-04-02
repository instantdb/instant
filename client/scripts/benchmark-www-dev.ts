import { spawn, type ChildProcess } from 'node:child_process';
import { rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

type LogEntry = {
  text: string;
  time: number;
};

type RouteResult = {
  route: string;
  status: number;
  requestMs: number;
  responseBytes: number;
  compileLine?: string;
  requestLine?: string;
};

const DEFAULT_ROUTES = ['/', '/about'];
const DEFAULT_SLOT = 8;
const DEFAULT_TIMEOUT_MS = 90_000;

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: {
    slot: number;
    routes: string[];
    timeoutMs: number;
    cleanNextCache: boolean;
    out?: string;
  } = {
    slot: DEFAULT_SLOT,
    routes: DEFAULT_ROUTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    cleanNextCache: true,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--slot') {
      parsed.slot = Number(args[++i] ?? DEFAULT_SLOT);
      continue;
    }

    if (arg === '--routes') {
      parsed.routes = splitRoutes(args[++i]);
      continue;
    }

    if (arg === '--timeout-ms') {
      parsed.timeoutMs = Number(args[++i] ?? DEFAULT_TIMEOUT_MS);
      continue;
    }

    if (arg === '--out') {
      parsed.out = args[++i];
      continue;
    }

    if (arg === '--keep-next-cache') {
      parsed.cleanNextCache = false;
      continue;
    }
  }

  return parsed;
}

function splitRoutes(value?: string) {
  if (!value) return DEFAULT_ROUTES;

  return value
    .split(',')
    .map((route) => route.trim())
    .filter(Boolean);
}

function stripAnsi(text: string) {
  return text
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, '')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B[@-_]/g, '');
}

function slotEnv(slot: number) {
  return {
    PORT: String(3000 + slot * 100),
    SB_PORT: String(4000 + slot * 100),
    SB_EXPRESS_PORT: String(3005 + slot * 100),
    NEXT_PUBLIC_LOCAL_SERVER_PORT: String(8888 + slot * 1000),
    NEXT_PUBLIC_FEEDBACK_API_URI: `http://localhost:${8888 + slot * 1000}`,
  };
}

function waitForSocket(port: number, timeoutMs: number) {
  const startedAt = Date.now();

  return new Promise<void>((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({
        host: '127.0.0.1',
        port,
      });

      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.once('error', () => {
        socket.destroy();

        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`));
          return;
        }

        setTimeout(attempt, 250);
      });
    };

    attempt();
  });
}

async function waitForReady({
  logs,
  port,
  timeoutMs,
}: {
  logs: LogEntry[];
  port: number;
  timeoutMs: number;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const readyLine = logs.find(
      (entry) =>
        entry.text.includes('instant-www:dev:') &&
        entry.text.includes('Ready in '),
    );
    if (readyLine) {
      await waitForSocket(port, timeoutMs);
      return readyLine.text;
    }

    await sleep(100);
  }

  throw new Error('Timed out waiting for `instant-www` to become ready');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesCompiledRoute(text: string, route: string) {
  return (
    text.includes(`Compiled ${route} in `) ||
    text.includes(`Compiling ${route} ...`) ||
    text.includes(`Compiling ${route} `)
  );
}

function matchesRequestRoute(text: string, route: string) {
  const routePattern = escapeRegex(route);
  return new RegExp(`\\bGET ${routePattern}(?:\\?|\\s)`).test(text);
}

function parseDurationMs(line: string) {
  const match = line.match(/ in ([\d.]+)(ms|s)\b/);
  if (!match) return undefined;

  const value = Number(match[1]);
  return match[2] === 's' ? value * 1000 : value;
}

function findMatchingLine(
  logs: LogEntry[],
  startedAt: number,
  matcher: (text: string) => boolean,
) {
  const entries = logs.filter((entry) => entry.time >= startedAt);
  return entries.find((entry) => matcher(entry.text))?.text;
}

async function benchmarkRoute({
  baseUrl,
  logs,
  route,
  timeoutMs,
}: {
  baseUrl: string;
  logs: LogEntry[];
  route: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${route}`, {
      signal: controller.signal,
      headers: {
        accept: 'text/html',
      },
    });

    const body = await response.text();
    const requestMs = Date.now() - startedAt;

    await sleep(300);

    const compileLine = findMatchingLine(
      logs,
      startedAt,
      (text) => matchesCompiledRoute(text, route),
    );
    const requestLine = findMatchingLine(
      logs,
      startedAt,
      (text) => matchesRequestRoute(text, route),
    );

    return {
      route,
      status: response.status,
      requestMs,
      responseBytes: Buffer.byteLength(body),
      compileLine,
      requestLine,
    } satisfies RouteResult;
  } finally {
    clearTimeout(timeout);
  }
}

async function stopProcess(child: ChildProcess) {
  if (child.exitCode != null) return;

  if (child.pid && process.platform !== 'win32') {
    process.kill(-child.pid, 'SIGINT');
  } else {
    child.kill('SIGINT');
  }

  const startedAt = Date.now();
  while (child.exitCode == null && Date.now() - startedAt < 5_000) {
    await sleep(100);
  }

  if (child.exitCode == null) {
    if (child.pid && process.platform !== 'win32') {
      process.kill(-child.pid, 'SIGKILL');
    } else {
      child.kill('SIGKILL');
    }
  }
}

async function main() {
  const { slot, routes, timeoutMs, cleanNextCache, out } = parseArgs();
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const clientRoot = path.resolve(scriptDir, '..');
  const wwwRoot = path.join(clientRoot, 'www');

  if (cleanNextCache) {
    await rm(path.join(wwwRoot, '.next'), { recursive: true, force: true });
  }

  const env = {
    ...process.env,
    ...slotEnv(slot),
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  };
  const logs: LogEntry[] = [];
  const port = Number(env.PORT);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn('pnpm', ['run', 'dev', '--ui', 'stream'], {
    cwd: clientRoot,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const capture = (chunk: Buffer | string) => {
    const lines = stripAnsi(chunk.toString())
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    for (const line of lines) {
      logs.push({
        text: line,
        time: Date.now(),
      });
    }
  };

  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  const cleanup = async () => {
    await stopProcess(child);
  };

  process.on('SIGINT', () => {
    void cleanup().finally(() => process.exit(130));
  });
  process.on('SIGTERM', () => {
    void cleanup().finally(() => process.exit(143));
  });

  try {
    const readyLine = await waitForReady({ logs, port, timeoutMs });
    const coldResults: RouteResult[] = [];

    for (const route of routes) {
      coldResults.push(
        await benchmarkRoute({
          baseUrl,
          logs,
          route,
          timeoutMs,
        }),
      );
    }

    const warmResults: RouteResult[] = [];

    for (const route of routes) {
      warmResults.push(
        await benchmarkRoute({
          baseUrl,
          logs,
          route,
          timeoutMs,
        }),
      );
    }

    const result = {
      command: 'pnpm run dev --ui stream',
      cleanNextCache,
      slot,
      port,
      readyLine,
      coldResults: coldResults.map((entry) => ({
        ...entry,
        compileMs: entry.compileLine ? parseDurationMs(entry.compileLine) : null,
        nextRequestMs: entry.requestLine ? parseDurationMs(entry.requestLine) : null,
      })),
      warmResults: warmResults.map((entry) => ({
        ...entry,
        compileMs: entry.compileLine ? parseDurationMs(entry.compileLine) : null,
        nextRequestMs: entry.requestLine ? parseDurationMs(entry.requestLine) : null,
      })),
    };

    const json = JSON.stringify(result, null, 2);

    if (out) {
      await writeFile(out, `${json}\n`, 'utf8');
    }

    console.log(json);
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

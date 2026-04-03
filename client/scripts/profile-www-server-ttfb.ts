import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

type LogEntry = {
  text: string;
  time: number;
};

type CpuProfile = {
  nodes: Array<{
    callFrame: {
      columnNumber: number;
      functionName: string;
      lineNumber: number;
      scriptId: string;
      url: string;
    };
    children?: number[];
    hitCount?: number;
    id: number;
  }>;
  samples?: number[];
  startTime: number;
  endTime: number;
  timeDeltas?: number[];
};

type CpuProfileNodeSummary = {
  functionName: string;
  location: string | null;
  selfMs: number;
  totalMs: number;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: {
    cleanNextCache: boolean;
    route: string;
    slot: number;
    timeoutMs: number;
  } = {
    cleanNextCache: true,
    route: '/',
    slot: 8,
    timeoutMs: 120_000,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--route') {
      parsed.route = args[++i] ?? '/';
      continue;
    }

    if (arg === '--slot') {
      parsed.slot = Number(args[++i] ?? 8);
      continue;
    }

    if (arg === '--timeout-ms') {
      parsed.timeoutMs = Number(args[++i] ?? 120_000);
      continue;
    }

    if (arg === '--keep-next-cache') {
      parsed.cleanNextCache = false;
      continue;
    }
  }

  return parsed;
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

function waitForCondition<T>(
  label: string,
  timeoutMs: number,
  getValue: () => T | null | undefined,
) {
  const startedAt = Date.now();

  return new Promise<T>((resolve, reject) => {
    const attempt = () => {
      const value = getValue();
      if (value != null) {
        resolve(value);
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }

      setTimeout(attempt, 100);
    };

    attempt();
  });
}

class JsonRpcWebSocket {
  private id = 0;
  private pending = new Map<
    number,
    {
      reject: (error: Error) => void;
      resolve: (value: any) => void;
    }
  >();
  private listeners = new Map<string, Set<(params: any) => void>>();
  private websocket: WebSocket;

  constructor(private readonly websocketUrl: string) {
    const WebSocketImpl = globalThis.WebSocket as typeof WebSocket | undefined;
    if (!WebSocketImpl) {
      throw new Error('WebSocket is not available in this Node runtime');
    }

    this.websocket = new WebSocketImpl(websocketUrl);
  }

  async connect() {
    await new Promise<void>((resolve, reject) => {
      this.websocket.addEventListener('error', () => {
        reject(new Error(`Failed to connect to ${this.websocketUrl}`));
      });

      this.websocket.addEventListener('open', () => {
        resolve();
      });
    });

    this.websocket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));

      if (message.id != null) {
        const pending = this.pending.get(message.id);
        if (!pending) return;

        this.pending.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error.message));
          return;
        }

        pending.resolve(message.result);
        return;
      }

      if (!message.method) return;

      const handlers = this.listeners.get(message.method);
      if (!handlers) return;

      for (const handler of handlers) {
        handler(message.params);
      }
    });
  }

  close() {
    this.websocket.close();
  }

  on(method: string, handler: (params: any) => void) {
    const handlers = this.listeners.get(method) ?? new Set();
    handlers.add(handler);
    this.listeners.set(method, handlers);
  }

  async send<T = any>(method: string, params?: Record<string, any>) {
    const id = ++this.id;

    const response = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.websocket.send(
      JSON.stringify({
        id,
        method,
        params,
      }),
    );

    return response;
  }
}

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function formatLocation(url: string, lineNumber: number, columnNumber: number) {
  if (!url) return null;

  return `${url}:${lineNumber + 1}:${columnNumber + 1}`;
}

function summarizeCpuProfile(profile: CpuProfile) {
  const nodeById = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentById = new Map<number, number | null>();

  for (const node of profile.nodes) {
    if (!node.children) continue;

    for (const childId of node.children) {
      parentById.set(childId, node.id);
    }
  }

  const selfMsById = new Map<number, number>();
  const totalMsById = new Map<number, number>();
  const samples = profile.samples ?? [];
  const timeDeltas = profile.timeDeltas ?? [];

  for (let i = 0; i < samples.length; i += 1) {
    const sampleId = samples[i];
    const deltaMs = (timeDeltas[i] ?? 0) / 1000;

    selfMsById.set(sampleId, (selfMsById.get(sampleId) ?? 0) + deltaMs);

    let cursor: number | null | undefined = sampleId;
    while (cursor != null) {
      totalMsById.set(cursor, (totalMsById.get(cursor) ?? 0) + deltaMs);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  const summarizeNode = (nodeId: number): CpuProfileNodeSummary => {
    const node = nodeById.get(nodeId)!;
    return {
      functionName: node.callFrame.functionName || '(anonymous)',
      location: formatLocation(
        node.callFrame.url,
        node.callFrame.lineNumber,
        node.callFrame.columnNumber,
      ),
      selfMs: roundMs(selfMsById.get(nodeId) ?? 0),
      totalMs: roundMs(totalMsById.get(nodeId) ?? 0),
    };
  };

  const ranked = Array.from(nodeById.keys())
    .map(summarizeNode)
    .filter(
      (node) =>
        node.functionName !== '(idle)' &&
        node.functionName !== '(program)' &&
        node.functionName !== '(garbage collector)',
    );

  const topSelfFrames = [...ranked]
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 25);
  const topTotalFrames = [...ranked]
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 25);

  const fileTotals = new Map<
    string,
    {
      selfMs: number;
      totalMs: number;
    }
  >();

  for (const nodeId of nodeById.keys()) {
    const node = nodeById.get(nodeId)!;
    const url = node.callFrame.url;
    if (!url) continue;

    const totals = fileTotals.get(url) ?? { selfMs: 0, totalMs: 0 };
    totals.selfMs += selfMsById.get(nodeId) ?? 0;
    totals.totalMs += totalMsById.get(nodeId) ?? 0;
    fileTotals.set(url, totals);
  }

  const topFiles = Array.from(fileTotals.entries())
    .map(([url, totals]) => ({
      selfMs: roundMs(totals.selfMs),
      totalMs: roundMs(totals.totalMs),
      url,
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 25);

  return {
    topFiles,
    topSelfFrames,
    topTotalFrames,
  };
}

async function main() {
  const { cleanNextCache, route, slot, timeoutMs } = parseArgs();
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const clientRoot = path.resolve(scriptDir, '..');
  const wwwRoot = path.join(clientRoot, 'www');
  const env = {
    ...process.env,
    ...slotEnv(slot),
    NEXT_TELEMETRY_DISABLED: '1',
  };
  const port = Number(env.PORT);
  const routeUrl = `http://127.0.0.1:${port}${route}`;
  const logs: LogEntry[] = [];

  if (cleanNextCache) {
    await rm(path.join(wwwRoot, '.next'), { recursive: true, force: true });
  }

  const nextBin = path.join(wwwRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!existsSync(nextBin)) {
    throw new Error(`Could not find Next CLI at ${nextBin}`);
  }

  const child = spawn(
    process.execPath,
    ['--inspect=0', nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: wwwRoot,
      detached: process.platform !== 'win32',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

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

  try {
    const readyLine = await waitForCondition('Next ready', timeoutMs, () => {
      const line = logs.find((entry) => entry.text.includes('Ready in '));
      return line?.text ?? null;
    });

    const inspectorUrls = logs
      .map((entry) => {
        const match = entry.text.match(/Debugger listening on (ws:\/\/\S+)/);
        return match?.[1] ?? null;
      })
      .filter((value): value is string => value != null);

    const inspectorUrl = inspectorUrls.at(-1);
    if (!inspectorUrl) {
      throw new Error('Timed out waiting for router server inspector URL');
    }

    const rpc = new JsonRpcWebSocket(inspectorUrl);
    await rpc.connect();

    try {
      await rpc.send('Profiler.enable');
      await rpc.send('Profiler.setSamplingInterval', { interval: 100 });
      await rpc.send('Profiler.start');

      const requestStartedAt = Date.now();
      const response = await fetch(routeUrl, {
        headers: {
          accept: 'text/html',
        },
      });
      const body = await response.text();
      const requestMs = Date.now() - requestStartedAt;

      await sleep(100);
      const { profile } = await rpc.send<{ profile: CpuProfile }>('Profiler.stop');
      const routeLog = logs
        .filter((entry) => entry.time >= requestStartedAt)
        .map((entry) => entry.text)
        .find((text) => text.includes(`GET ${route}`));

      const outDir = path.join(clientRoot, 'dev-llm-docs', 'server-profiles');
      await mkdir(outDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeRoute = route.replace(/[^\w/-]+/g, '_').replace(/\//g, '_') || '_';
      const profilePath = path.join(outDir, `${stamp}${safeRoute}.cpuprofile`);
      const summaryPath = path.join(outDir, `${stamp}${safeRoute}.summary.json`);
      const summary = summarizeCpuProfile(profile);

      await writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');
      await writeFile(
        summaryPath,
        JSON.stringify(
          {
            cleanNextCache,
            inspectorUrl,
            inspectorUrls,
            readyLine,
            request: {
              requestMs,
              route,
              routeLog: routeLog ?? null,
              routeUrl,
              status: response.status,
              responseBytes: Buffer.byteLength(body),
            },
            summary,
          },
          null,
          2,
        ),
        'utf8',
      );

      console.log(
        JSON.stringify(
          {
            cleanNextCache,
            inspectorUrl,
            inspectorUrls,
            readyLine,
            request: {
              requestMs,
              route,
              routeLog: routeLog ?? null,
              routeUrl,
              status: response.status,
              responseBytes: Buffer.byteLength(body),
            },
            summary,
            summaryPath,
            profilePath,
          },
          null,
          2,
        ),
      );
    } finally {
      rpc.close();
    }
  } finally {
    await stopProcess(child);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

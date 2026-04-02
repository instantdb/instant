import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

type LogEntry = {
  text: string;
  time: number;
};

type TraceEvent = {
  args?: Record<string, any>;
  cat?: string;
  dur?: number;
  name?: string;
  ph?: string;
  pid?: number;
  tid?: number;
  ts?: number;
};

type NetworkRequest = {
  encodedDataLength?: number;
  endTime?: number;
  initiatorType?: string;
  method?: string;
  mimeType?: string;
  requestId: string;
  responseTime?: number;
  startTime: number;
  status?: number;
  type?: string;
  url: string;
};

type ChromeTarget = {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

const DEFAULT_SLOT = 8;
const DEFAULT_ROUTE = '/';
const DEFAULT_TIMEOUT_MS = 120_000;
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'blink.user_timing',
  'loading',
  'toplevel',
  'v8.execute',
];

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: {
    cleanNextCache: boolean;
    route: string;
    slot: number;
    timeoutMs: number;
  } = {
    cleanNextCache: true,
    route: DEFAULT_ROUTE,
    slot: DEFAULT_SLOT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--route') {
      parsed.route = args[++i] ?? DEFAULT_ROUTE;
      continue;
    }

    if (arg === '--slot') {
      parsed.slot = Number(args[++i] ?? DEFAULT_SLOT);
      continue;
    }

    if (arg === '--timeout-ms') {
      parsed.timeoutMs = Number(args[++i] ?? DEFAULT_TIMEOUT_MS);
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

async function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate a free port'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Could not find a Chrome executable. Set CHROME_BIN.');
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      await sleep(100);
    }
  }

  throw new Error(`Timed out fetching ${url}`);
}

class CDPSession {
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

function roundMs(value?: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}

function summarizeTrace({
  loadEventTime,
  metrics,
  requests,
  routeUrl,
  traceEvents,
}: {
  loadEventTime: number;
  metrics: any[];
  requests: NetworkRequest[];
  routeUrl: string;
  traceEvents: TraceEvent[];
}) {
  const metricMap = new Map(metrics.map((metric) => [metric.name, metric.value]));
  const routeRequest =
    requests.find(
      (request) =>
        request.type === 'Document' &&
        (request.url === routeUrl || request.url === `${routeUrl}/`),
    ) ??
    requests.find((request) => request.url.startsWith(routeUrl));

  const navigationStart = routeRequest?.startTime ?? 0;
  const loadEventMs =
    navigationStart && loadEventTime
      ? roundMs((loadEventTime - navigationStart) * 1000)
      : null;

  const metadataThreads = new Map<string, string>();
  for (const event of traceEvents) {
    if (event.ph !== 'M' || event.name !== 'thread_name') continue;
    metadataThreads.set(`${event.pid}:${event.tid}`, event.args?.name ?? '');
  }

  const mainThreadKey = Array.from(metadataThreads.entries()).find(([, name]) =>
    name.includes('CrRendererMain'),
  )?.[0];

  const mainThreadEvents =
    mainThreadKey == null
      ? []
      : traceEvents.filter((event) => {
          if (event.ph !== 'X' || event.dur == null || event.ts == null) {
            return false;
          }

          return `${event.pid}:${event.tid}` === mainThreadKey;
        });

  const navigationStartUs = navigationStart * 1_000_000;
  const loadEventUs = loadEventTime * 1_000_000;

  const topMainThreadDurations = Array.from(
    mainThreadEvents
      .filter((event) => {
        if (event.ts == null || event.dur == null || event.name == null) {
          return false;
        }

        return event.ts >= navigationStartUs && event.ts <= loadEventUs;
      })
      .reduce((totals, event) => {
        const name = event.name ?? 'unknown';
        const total = totals.get(name) ?? 0;
        totals.set(name, total + event.dur! / 1000);
        return totals;
      }, new Map<string, number>())
      .entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, durationMs]) => ({
      durationMs: roundMs(durationMs),
      name,
    }));

  const topRequests = requests
    .map((request) => ({
      durationMs:
        request.endTime != null ? roundMs((request.endTime - request.startTime) * 1000) : null,
      mimeType: request.mimeType ?? null,
      status: request.status ?? null,
      type: request.type ?? null,
      url: request.url,
    }))
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, 15);

  return {
    documentRequest: routeRequest
      ? {
          durationMs:
            routeRequest.endTime != null
              ? roundMs((routeRequest.endTime - routeRequest.startTime) * 1000)
              : null,
          encodedDataLength: routeRequest.encodedDataLength ?? null,
          status: routeRequest.status ?? null,
          ttfbMs:
            routeRequest.responseTime != null
              ? roundMs((routeRequest.responseTime - routeRequest.startTime) * 1000)
              : null,
          url: routeRequest.url,
        }
      : null,
    loadEventMs,
    metrics: {
      JSHeapUsedSize: roundMs(metricMap.get('JSHeapUsedSize')),
      LayoutDurationMs: roundMs((metricMap.get('LayoutDuration') ?? 0) * 1000),
      Nodes: metricMap.get('Nodes') ?? null,
      RecalcStyleDurationMs: roundMs(
        (metricMap.get('RecalcStyleDuration') ?? 0) * 1000,
      ),
      ScriptDurationMs: roundMs((metricMap.get('ScriptDuration') ?? 0) * 1000),
      TaskDurationMs: roundMs((metricMap.get('TaskDuration') ?? 0) * 1000),
    },
    topMainThreadDurations,
    topRequests,
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
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  };
  const port = Number(env.PORT);
  const baseUrl = `http://127.0.0.1:${port}`;
  const routeUrl = `${baseUrl}${route}`;
  const logs: LogEntry[] = [];
  const chromeLogs: string[] = [];

  if (cleanNextCache) {
    await rm(path.join(wwwRoot, '.next'), { recursive: true, force: true });
  }

  const devServer = spawn('pnpm', ['run', 'dev', '--ui', 'stream'], {
    cwd: clientRoot,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const captureLogs = (chunk: Buffer | string) => {
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

  devServer.stdout?.on('data', captureLogs);
  devServer.stderr?.on('data', captureLogs);

  const cleanupDevServer = async () => {
    await stopProcess(devServer);
  };

  let chrome: ChildProcess | null = null;
  let cdp: CDPSession | null = null;
  let chromeUserDataDir: string | null = null;

  try {
    const readyLine = await waitForReady({ logs, port, timeoutMs });
    const chromeExecutable = findChromeExecutable();
    const chromePort = await getFreePort();
    chromeUserDataDir = await mkdtemp(
      path.join(os.tmpdir(), 'instant-www-trace-'),
    );

    chrome = spawn(
      chromeExecutable,
      [
        '--headless=new',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-gpu',
        '--no-default-browser-check',
        '--no-first-run',
        `--remote-debugging-port=${chromePort}`,
        `--user-data-dir=${chromeUserDataDir}`,
        'about:blank',
      ],
      {
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    chrome.stdout?.on('data', (chunk) => {
      chromeLogs.push(stripAnsi(chunk.toString()));
    });
    chrome.stderr?.on('data', (chunk) => {
      chromeLogs.push(stripAnsi(chunk.toString()));
    });

    await fetchJson(`http://127.0.0.1:${chromePort}/json/version`, timeoutMs);
    const targets = await fetchJson<ChromeTarget[]>(
      `http://127.0.0.1:${chromePort}/json/list`,
      timeoutMs,
    );
    const pageTarget =
      targets.find((target) => target.type === 'page') ?? targets[0];

    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error('Could not find a page target for Chrome tracing');
    }

    cdp = new CDPSession(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    const requests = new Map<string, NetworkRequest>();
    const traceEvents: TraceEvent[] = [];
    let loadEventTime: number | null = null;
    let tracingComplete = false;

    cdp.on('Network.requestWillBeSent', (params) => {
      requests.set(params.requestId, {
        requestId: params.requestId,
        startTime: params.timestamp,
        url: params.request.url,
        method: params.request.method,
        initiatorType: params.initiator?.type,
        type: params.type,
      });
    });

    cdp.on('Network.responseReceived', (params) => {
      const existing = requests.get(params.requestId);
      if (!existing) return;

      existing.responseTime = params.timestamp;
      existing.status = params.response.status;
      existing.mimeType = params.response.mimeType;
      existing.type = params.type;
    });

    cdp.on('Network.loadingFinished', (params) => {
      const existing = requests.get(params.requestId);
      if (!existing) return;

      existing.endTime = params.timestamp;
      existing.encodedDataLength = params.encodedDataLength;
    });

    cdp.on('Network.loadingFailed', (params) => {
      const existing = requests.get(params.requestId);
      if (!existing) return;

      existing.endTime = params.timestamp;
    });

    cdp.on('Page.loadEventFired', (params) => {
      loadEventTime = params.timestamp;
    });

    cdp.on('Tracing.dataCollected', (params) => {
      traceEvents.push(...params.value);
    });

    cdp.on('Tracing.tracingComplete', () => {
      tracingComplete = true;
    });

    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Performance.enable');
    await cdp.send('Tracing.start', {
      categories: TRACE_CATEGORIES.join(','),
      transferMode: 'ReportEvents',
    });
    await cdp.send('Page.navigate', { url: routeUrl });

    const loadTimestamp = await waitForCondition(
      'page load',
      timeoutMs,
      () => loadEventTime,
    );

    await sleep(1_000);
    const performanceMetrics = await cdp.send<{ metrics: any[] }>(
      'Performance.getMetrics',
    );
    await cdp.send('Tracing.end');
    await waitForCondition('trace completion', timeoutMs, () =>
      tracingComplete ? true : null,
    );

    const outDir = path.join(clientRoot, 'dev-llm-docs', 'traces');
    await mkdir(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeRoute = route.replace(/[^\w/-]+/g, '_').replace(/\//g, '_') || '_';
    const tracePath = path.join(outDir, `${stamp}${safeRoute}.trace.json`);
    const summaryPath = path.join(outDir, `${stamp}${safeRoute}.summary.json`);

    const summary = summarizeTrace({
      loadEventTime: loadTimestamp,
      metrics: performanceMetrics.metrics,
      requests: Array.from(requests.values()),
      routeUrl,
      traceEvents,
    });

    await writeFile(
      tracePath,
      JSON.stringify({ traceEvents }, null, 2),
      'utf8',
    );
    await writeFile(
      summaryPath,
      JSON.stringify(
        {
          chromeExecutable,
          cleanNextCache,
          readyLine,
          route,
          routeUrl,
          slot,
          summary,
          tracePath,
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
          readyLine,
          route,
          routeUrl,
          slot,
          summary,
          summaryPath,
          tracePath,
        },
        null,
        2,
      ),
    );
  } finally {
    cdp?.close();

    if (chrome) {
      await stopProcess(chrome);
    }

    if (chromeUserDataDir) {
      await rm(chromeUserDataDir, { recursive: true, force: true });
    }

    await cleanupDevServer();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

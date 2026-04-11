/** Shared helpers for smoke tests. */

import WebSocket from 'ws';

export const API = process.env.API_URI || 'http://localhost:8888';
export const WS = process.env.WS_URI || 'ws://localhost:8888/runtime/session';

/** App state created during setup. */
export interface TestApp {
  id: string;
  adminToken: string;
  attrs: Record<string, any>;
}

/** POST JSON helper. */
export async function post(path: string, body: any, headers: Record<string, string> = {}): Promise<any> {
  const resp = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return resp.json();
}

/** GET helper. */
export async function get(path: string, headers: Record<string, string> = {}): Promise<any> {
  const resp = await fetch(`${API}${path}`, { headers });
  return resp.json();
}

/** DELETE helper. */
export async function del(path: string, body: any, headers: Record<string, string> = {}): Promise<any> {
  const resp = await fetch(`${API}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return resp.json();
}

/** Auth headers for admin requests. */
export function adminHeaders(app: TestApp): Record<string, string> {
  return {
    'app-id': app.id,
    'Authorization': `Bearer ${app.adminToken}`,
  };
}

/** Create a test app with schema. */
export async function createTestApp(): Promise<TestApp> {
  const appResp = await post('/admin/apps', { title: 'Smoke Test App' });
  const app: TestApp = {
    id: appResp.app.id,
    adminToken: appResp.app['admin-token'],
    attrs: {},
  };

  // Push schema
  const schemaResp = await post('/admin/schema', {
    schema: {
      entities: {
        todos: {
          attrs: {
            id: { unique: true, indexed: true },
            text: {},
            done: {},
            priority: { indexed: true },
            createdAt: {},
          },
        },
        projects: {
          attrs: {
            id: { unique: true, indexed: true },
            name: {},
            description: {},
          },
        },
        comments: {
          attrs: {
            id: { unique: true, indexed: true },
            body: {},
            author: {},
          },
        },
      },
      links: {
        todoProject: {
          forward: { on: 'todos', has: 'one', label: 'project' },
          reverse: { on: 'projects', has: 'many', label: 'todos' },
        },
      },
    },
  }, adminHeaders(app));

  // Build attr lookup
  for (const attr of schemaResp.attrs || []) {
    const fwd = attr['forward-identity'];
    if (fwd) {
      app.attrs[`${fwd[1]}.${fwd[2]}`] = attr;
    }
  }

  return app;
}

/** Open a WebSocket connection to the server. */
export function connectWS(appID: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}?app_id=${appID}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS connect timeout')), 5000);
  });
}

/** Send a JSON message over WebSocket. */
export function wsSend(ws: WebSocket, msg: Record<string, any>) {
  ws.send(JSON.stringify(msg));
}

/** Wait for a WS message matching a predicate. */
export function wsWaitFor(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs = 5000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error('WS message timeout'));
    }, timeoutMs);

    function handler(data: WebSocket.Data) {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    }
    ws.on('message', handler);
  });
}

/** Init a WS session and return session ID + attrs. */
export async function wsInit(
  ws: WebSocket,
  app: TestApp,
  opts: { refreshToken?: string } = {},
): Promise<{ sessionId: string; attrs: any[] }> {
  const eventId = crypto.randomUUID();
  wsSend(ws, {
    op: 'init',
    'app-id': app.id,
    '__admin-token': app.adminToken,
    'refresh-token': opts.refreshToken,
    'client-event-id': eventId,
    versions: { '@instantdb/core': '0.22.75' },
  });

  const msg = await wsWaitFor(ws, (m) => m.op === 'init-ok');
  return { sessionId: msg['session-id'], attrs: msg.attrs };
}

/** Shorthand UUID. */
export function uuid(): string {
  return crypto.randomUUID();
}

/** Find an attr by etype.label in the app attrs. */
export function findAttr(app: TestApp, key: string): any {
  return app.attrs[key];
}

/** Small sleep helper. */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

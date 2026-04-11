/**
 * Test setup — creates app + schema on the Go server
 * and writes the app ID to a .env file for Vite to pick up.
 */
import fs from 'fs';
import path from 'path';

const API = 'http://localhost:8888';

export interface TestAppInfo {
  appId: string;
  adminToken: string;
}

export async function setupTestApp(): Promise<TestAppInfo> {
  // Create app
  const appResp = await fetch(`${API}/admin/apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'E2E Full Features' }),
  });
  const appData = await appResp.json();
  const appId = appData.app.id;
  const adminToken = appData.app['admin-token'];

  // Push schema with all entity types and links
  await fetch(`${API}/admin/schema`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      schema: {
        entities: {
          todos: {
            attrs: {
              id: { unique: true, indexed: true },
              text: {},
              done: {},
              createdAt: { indexed: true },
              priority: { indexed: true },
            },
          },
          projects: {
            attrs: {
              id: { unique: true, indexed: true },
              name: {},
              color: {},
              createdAt: { indexed: true },
            },
          },
          messages: {
            attrs: {
              id: { unique: true, indexed: true },
              content: {},
              sender: {},
              category: {},
              priority: { indexed: true },
              createdAt: { indexed: true },
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
    }),
  });

  // Write .env for Vite
  const envPath = path.join(import.meta.dirname, '..', '.env');
  fs.writeFileSync(
    envPath,
    `VITE_APP_ID=${appId}\nVITE_ADMIN_TOKEN=${adminToken}\n`,
  );

  return { appId, adminToken };
}

/** Helper to get attribute info from schema */
async function getAttrs(appId: string, adminToken: string) {
  const resp = await fetch(`${API}/admin/schema?app_id=${appId}`, {
    headers: { 'app-id': appId, Authorization: `Bearer ${adminToken}` },
  });
  const data = await resp.json();
  return data.attrs || [];
}

function findAttr(attrs: any[], entity: string, attrName: string) {
  return attrs.find(
    (a: any) =>
      a['forward-identity']?.[1] === entity &&
      a['forward-identity']?.[2] === attrName,
  );
}

/** Seed todos via admin API */
export async function seedTodos(
  appId: string,
  adminToken: string,
  count: number,
): Promise<string[]> {
  const attrs = await getAttrs(appId, adminToken);
  const textAttr = findAttr(attrs, 'todos', 'text');
  const doneAttr = findAttr(attrs, 'todos', 'done');
  const createdAtAttr = findAttr(attrs, 'todos', 'createdAt');
  const priorityAttr = findAttr(attrs, 'todos', 'priority');

  const idAttr = findAttr(attrs, 'todos', 'id');

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const todoId = crypto.randomUUID();
    ids.push(todoId);
    await fetch(`${API}/admin/transact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'app-id': appId,
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        steps: [
          ['add-triple', todoId, idAttr.id, todoId],
          ['add-triple', todoId, textAttr.id, `Seeded todo ${i + 1}`],
          ['add-triple', todoId, doneAttr.id, false],
          ['add-triple', todoId, createdAtAttr.id, Date.now() + i * 100],
          ['add-triple', todoId, priorityAttr.id, i + 1],
        ],
      }),
    });
  }
  return ids;
}

/** Seed messages via admin API for query testing */
export async function seedMessages(
  appId: string,
  adminToken: string,
  messages: Array<{
    content: string;
    sender: string;
    category: string;
    priority: number;
  }>,
): Promise<string[]> {
  const attrs = await getAttrs(appId, adminToken);
  const contentAttr = findAttr(attrs, 'messages', 'content');
  const senderAttr = findAttr(attrs, 'messages', 'sender');
  const categoryAttr = findAttr(attrs, 'messages', 'category');
  const priorityAttr = findAttr(attrs, 'messages', 'priority');
  const createdAtAttr = findAttr(attrs, 'messages', 'createdAt');

  const idAttr = findAttr(attrs, 'messages', 'id');

  const ids: string[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msgId = crypto.randomUUID();
    ids.push(msgId);
    const m = messages[i];
    await fetch(`${API}/admin/transact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'app-id': appId,
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        steps: [
          ['add-triple', msgId, idAttr.id, msgId],
          ['add-triple', msgId, contentAttr.id, m.content],
          ['add-triple', msgId, senderAttr.id, m.sender],
          ['add-triple', msgId, categoryAttr.id, m.category],
          ['add-triple', msgId, priorityAttr.id, m.priority],
          ['add-triple', msgId, createdAtAttr.id, Date.now() + i * 100],
        ],
      }),
    });
  }
  return ids;
}

/** Clear all entities of a given type */
export async function clearEntities(
  appId: string,
  adminToken: string,
  entityType: string,
) {
  const resp = await fetch(`${API}/admin/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ query: { [entityType]: {} } }),
  });
  const data = await resp.json();
  const entities = data[entityType] || [];
  if (entities.length === 0) return;

  const steps = entities.map((e: any) => [
    'delete-entity',
    e.id,
    entityType,
  ]);
  await fetch(`${API}/admin/transact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ steps }),
  });
}

/** Shorthand for clearing todos */
export async function clearTodos(appId: string, adminToken: string) {
  await clearEntities(appId, adminToken, 'todos');
}

/** Clear all entity types */
export async function clearAll(appId: string, adminToken: string) {
  await clearEntities(appId, adminToken, 'todos');
  await clearEntities(appId, adminToken, 'projects');
  await clearEntities(appId, adminToken, 'messages');
}

/** Send magic code via admin API (returns the code in dev mode) */
export async function sendMagicCode(
  appId: string,
  email: string,
): Promise<string> {
  const resp = await fetch(`${API}/admin/magic-code/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'app-id': appId, email }),
  });
  const data = await resp.json();
  return data.code; // Dev mode returns the code directly
}

/** Verify magic code */
export async function verifyMagicCode(
  appId: string,
  email: string,
  code: string,
): Promise<any> {
  const resp = await fetch(`${API}/admin/magic-code/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'app-id': appId, email, code }),
  });
  return resp.json();
}

/** Sign in as guest */
export async function signInAsGuest(appId: string): Promise<any> {
  const resp = await fetch(`${API}/admin/sign-in-as-guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'app-id': appId }),
  });
  return resp.json();
}

/** Set permission rules */
export async function setRules(
  appId: string,
  adminToken: string,
  rules: any,
): Promise<void> {
  await fetch(`${API}/admin/rules`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ code: rules }),
  });
}

/** Upload file metadata via admin API */
export async function uploadFileMeta(
  appId: string,
  adminToken: string,
  filePath: string,
  contentType: string,
  sizeBytes: number,
): Promise<any> {
  const resp = await fetch(`${API}/admin/storage/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      path: filePath,
      'content-type': contentType,
      'size-bytes': sizeBytes,
    }),
  });
  return resp.json();
}

/** List files via admin API */
export async function listFiles(
  appId: string,
  adminToken: string,
): Promise<any[]> {
  const resp = await fetch(`${API}/admin/storage/files?app_id=${appId}`, {
    headers: { 'app-id': appId, Authorization: `Bearer ${adminToken}` },
  });
  const data = await resp.json();
  return data['$files'] || [];
}

/** Delete file via admin API */
export async function deleteFile(
  appId: string,
  adminToken: string,
  fileId: string,
): Promise<void> {
  await fetch(`${API}/admin/storage/files`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ 'file-id': fileId }),
  });
}

/** Query data via admin API (useful for test assertions) */
export async function adminQuery(
  appId: string,
  adminToken: string,
  query: any,
): Promise<any> {
  const resp = await fetch(`${API}/admin/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ query }),
  });
  return resp.json();
}

/** Transact via admin API */
export async function adminTransact(
  appId: string,
  adminToken: string,
  steps: any[],
): Promise<any> {
  const resp = await fetch(`${API}/admin/transact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ steps }),
  });
  return resp.json();
}

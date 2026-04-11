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
    body: JSON.stringify({ title: 'E2E Todos' }),
  });
  const appData = await appResp.json();
  const appId = appData.app.id;
  const adminToken = appData.app['admin-token'];

  // Push schema
  await fetch(`${API}/admin/schema`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      'Authorization': `Bearer ${adminToken}`,
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
            },
          },
        },
      },
    }),
  });

  // Write .env for Vite
  const envPath = path.join(import.meta.dirname, '..', '.env');
  fs.writeFileSync(envPath, `VITE_APP_ID=${appId}\nVITE_ADMIN_TOKEN=${adminToken}\n`);

  return { appId, adminToken };
}

/** Seed some todos via admin API for tests that need pre-existing data. */
export async function seedTodos(appId: string, adminToken: string, count: number): Promise<string[]> {
  const schemaResp = await fetch(`${API}/admin/schema?app_id=${appId}`, {
    headers: { 'app-id': appId, 'Authorization': `Bearer ${adminToken}` },
  });
  const schemaData = await schemaResp.json();
  const attrs = schemaData.attrs || [];
  const idAttr = attrs.find((a: any) => a['forward-identity']?.[1] === 'todos' && a['forward-identity']?.[2] === 'id');
  const textAttr = attrs.find((a: any) => a['forward-identity']?.[1] === 'todos' && a['forward-identity']?.[2] === 'text');
  const doneAttr = attrs.find((a: any) => a['forward-identity']?.[1] === 'todos' && a['forward-identity']?.[2] === 'done');
  const createdAtAttr = attrs.find((a: any) => a['forward-identity']?.[1] === 'todos' && a['forward-identity']?.[2] === 'createdAt');

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const todoId = crypto.randomUUID();
    ids.push(todoId);
    await fetch(`${API}/admin/transact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'app-id': appId,
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        steps: [
          ['add-triple', todoId, idAttr.id, todoId],
          ['add-triple', todoId, textAttr.id, `Seeded todo ${i + 1}`],
          ['add-triple', todoId, doneAttr.id, false],
          ['add-triple', todoId, createdAtAttr.id, Date.now() + i * 100],
        ],
      }),
    });
  }
  return ids;
}

/** Clear all todos via admin API. */
export async function clearTodos(appId: string, adminToken: string) {
  const resp = await fetch(`${API}/admin/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ query: { todos: {} } }),
  });
  const data = await resp.json();
  const todos = data.todos || [];
  if (todos.length === 0) return;

  const steps = todos.map((t: any) => ['delete-entity', t.id, 'todos']);
  await fetch(`${API}/admin/transact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'app-id': appId,
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ steps }),
  });
}

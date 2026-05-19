import { useEffect, useState } from 'react';
import { init, id } from '@instantdb/admin';
import config from '@/lib/config';
import { provisionApp } from '@/lib/ephemeral';

const STORAGE_KEY = 'dash-redesign-ephemeral-app-v6';

type Cached = {
  id: string;
  adminToken: string;
  firstTodoId: string;
  firstTodoAttrId: string;
  seededAt: number;
};

function readCache(): Cached | null {
  try {
    const raw =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
    if (!raw) return null;
    return JSON.parse(raw) as Cached;
  } catch {
    return null;
  }
}

function writeCache(c: Cached) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

function clearCache() {
  window.localStorage.removeItem(STORAGE_KEY);
}

function adminHeaders(
  appId: string,
  adminToken: string,
): Record<string, string> {
  return {
    'content-type': 'application/json',
    'app-id': appId,
    authorization: `Bearer ${adminToken}`,
  };
}

async function fetchSchemaBlobs(
  appId: string,
  adminToken: string,
): Promise<Record<string, Record<string, { id: string }>> | null> {
  const schemaRes = await fetch(`${config.apiURI}/admin/schema`, {
    headers: adminHeaders(appId, adminToken),
  });
  if (!schemaRes.ok) {
    console.warn('[dash-redesign] schema fetch failed', await schemaRes.text());
    return null;
  }
  const schemaJson = (await schemaRes.json()) as {
    schema?: {
      blobs?: Record<string, Record<string, { id: string }>>;
    };
  };
  return schemaJson?.schema?.blobs ?? null;
}

async function transactDeleteAttrs(
  appId: string,
  adminToken: string,
  attrIds: string[],
) {
  const delRes = await fetch(
    `${config.apiURI}/admin/transact?app_id=${appId}`,
    {
      method: 'POST',
      headers: adminHeaders(appId, adminToken),
      body: JSON.stringify({
        steps: attrIds.map((attrId) => ['delete-attr', attrId]),
      }),
    },
  );
  if (!delRes.ok) {
    console.warn('[dash-redesign] delete-attr failed', await delRes.text());
  }
}

async function softDeletePriorityAttr(appId: string, adminToken: string) {
  const blobs = await fetchSchemaBlobs(appId, adminToken);
  const attrId = blobs?.todos?.priority?.id;
  if (!attrId) {
    console.warn(
      '[dash-redesign] could not find todos.priority attr; skipping',
    );
    return;
  }
  console.log('[dash-redesign] soft-deleting todos.priority attr', attrId);
  await transactDeleteAttrs(appId, adminToken, [attrId]);
}

async function seedAndDeleteNotesNamespace(appId: string, adminToken: string) {
  const db = init({ apiURI: config.apiURI, appId, adminToken });
  await db.transact([
    db.tx.notes[id()].update({
      body: 'Old meeting notes from Q1',
      pinned: false,
    }),
    db.tx.notes[id()].update({
      body: 'Recipe ideas',
      pinned: true,
    }),
  ]);
  const blobs = await fetchSchemaBlobs(appId, adminToken);
  const nsAttrs = blobs?.notes;
  if (!nsAttrs) {
    console.warn(
      '[dash-redesign] could not find notes namespace; skipping namespace delete',
    );
    return;
  }
  const attrIds: string[] = [];
  for (const attr of Object.values(nsAttrs)) {
    if (attr && typeof attr === 'object' && 'id' in attr) {
      attrIds.push((attr as { id: string }).id);
    }
  }
  if (attrIds.length === 0) {
    console.warn('[dash-redesign] no attrs in notes namespace; skipping');
    return;
  }
  console.log(
    `[dash-redesign] soft-deleting notes namespace (${attrIds.length} attrs)`,
  );
  await transactDeleteAttrs(appId, adminToken, attrIds);
}

async function provisionAndSeed(): Promise<Cached> {
  console.log('[dash-redesign] provisioning ephemeral app...');
  const { app } = await provisionApp({ title: 'Dash Redesign Sandbox' });
  const appId = app.id;
  const adminToken = app['admin-token'];
  console.log('[dash-redesign] provisioned, seeding todos...', { appId });
  const db = init({ apiURI: config.apiURI, appId, adminToken });
  const firstTodoId = id();
  await db.transact([
    db.tx.todos[firstTodoId].update({
      title: 'Buy milk',
      done: false,
      priority: 1,
    }),
    db.tx.todos[id()].update({
      title: 'Walk the dog',
      done: true,
      priority: 2,
    }),
    db.tx.todos[id()].update({
      title: 'Ship redesign',
      done: false,
      priority: 3,
    }),
    db.tx.todos[id()].update({
      title: 'Read a book',
      done: true,
      priority: 4,
    }),
    db.tx.todos[id()].update({
      title: 'Go for a run',
      done: false,
      priority: 5,
    }),
  ]);
  await softDeletePriorityAttr(appId, adminToken);
  await seedAndDeleteNotesNamespace(appId, adminToken);
  const blobs = await fetchSchemaBlobs(appId, adminToken);
  const todosBlobs = blobs?.todos ?? {};
  const firstTodoAttrId =
    todosBlobs.title?.id ||
    Object.entries(todosBlobs).find(
      ([name, val]) => name !== 'id' && val?.id,
    )?.[1]?.id ||
    '';
  if (!firstTodoAttrId) {
    console.warn(
      '[dash-redesign] could not find any editable attr on todos',
      todosBlobs,
    );
  }
  console.log('[dash-redesign] seed complete', { firstTodoAttrId });
  return {
    id: appId,
    adminToken,
    firstTodoId,
    firstTodoAttrId,
    seededAt: Date.now(),
  };
}

// Module-level promise so strict-mode double-mount doesn't double-provision,
// and a single in-flight request is shared by all subscribers.
let inflight: Promise<Cached> | null = null;

function getEphemeral(forceFresh: boolean): Promise<Cached> {
  if (!forceFresh) {
    const cached = readCache();
    if (cached) return Promise.resolve(cached);
  }
  if (!inflight) {
    inflight = provisionAndSeed()
      .then((result) => {
        writeCache(result);
        return result;
      })
      .catch((err) => {
        inflight = null;
        throw err;
      });
  }
  return inflight;
}

export type EphemeralApp = {
  id: string;
  adminToken: string;
  firstTodoId: string;
  firstTodoAttrId: string;
};

export type EphemeralState =
  | { status: 'loading' }
  | { status: 'ready'; app: EphemeralApp }
  | { status: 'error'; error: Error };

export function useEphemeralApp(): EphemeralState & { reset: () => void } {
  const [state, setState] = useState<EphemeralState>({ status: 'loading' });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getEphemeral(refreshKey > 0)
      .then((result) => {
        if (cancelled) return;
        setState({
          status: 'ready',
          app: {
            id: result.id,
            adminToken: result.adminToken,
            firstTodoId: result.firstTodoId,
            firstTodoAttrId: result.firstTodoAttrId,
          },
        });
      })
      .catch((err) => {
        console.error('[dash-redesign] provision/seed failed', err);
        if (cancelled) return;
        setState({
          status: 'error',
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const reset = () => {
    clearCache();
    inflight = null;
    setState({ status: 'loading' });
    setRefreshKey((k) => k + 1);
  };

  return { ...state, reset };
}

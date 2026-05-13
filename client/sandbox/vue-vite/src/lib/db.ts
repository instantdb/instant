import { ref, shallowRef } from 'vue';
import { init, i, type InstantSchemaDef } from '@instantdb/vue';
import config from './config';

const URL_PARAM = 'app';
const STORAGE_KEY = 'sb-vue-vite-ephemeral-app-id';

const schema = i.schema({
  entities: {
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.number(),
    }),
    items: i.entity({
      value: i.number().indexed(),
    }),
  },
});

type AppSchema = typeof schema;

async function provisionEphemeralApp(schema: InstantSchemaDef<any, any, any>) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Vue Sandbox', schema }),
  });
  if (!r.ok) throw await r.json();
  return r.json();
}

async function verifyEphemeralApp(appId: string) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw await r.json();
  return r.json();
}

function readAppIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(URL_PARAM);
}

function persistAppId(appId: string) {
  localStorage.setItem(STORAGE_KEY, appId);
  const url = new URL(window.location.href);
  if (url.searchParams.get(URL_PARAM) !== appId) {
    url.searchParams.set(URL_PARAM, appId);
    window.history.replaceState(null, '', url);
  }
}

async function getOrCreateAppId(): Promise<string> {
  // URL param wins over localStorage so a shared link can target a specific app
  // across tabs / users. Falls back to localStorage, then provisions fresh.
  const incoming = readAppIdFromUrl() || localStorage.getItem(STORAGE_KEY);

  if (incoming) {
    try {
      await verifyEphemeralApp(incoming);
      persistAppId(incoming);
      return incoming;
    } catch {
      // app no longer exists; fall through to provision a new one
    }
  }

  const res = await provisionEphemeralApp(schema);
  if (!res.app) throw new Error('Could not create ephemeral app');
  persistAppId(res.app.id);
  return res.app.id;
}

export type DB = ReturnType<typeof init<AppSchema>>;

export const isLoading = ref(true);
export const error = ref<string | null>(null);
export const db = shallowRef<DB | null>(null);

getOrCreateAppId()
  .then((appId) => {
    db.value = init({
      ...config,
      appId,
      schema,
      devtool: false,
    });
    isLoading.value = false;
  })
  .catch((e) => {
    error.value = (e as Error).message;
    isLoading.value = false;
  });

export function resetEphemeralApp() {
  localStorage.removeItem(STORAGE_KEY);
  const url = new URL(window.location.href);
  url.searchParams.delete(URL_PARAM);
  window.history.replaceState(null, '', url);
  location.reload();
}

export type { AppSchema };

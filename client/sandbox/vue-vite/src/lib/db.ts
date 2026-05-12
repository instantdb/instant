import { ref, shallowRef } from 'vue';
import { init, i, type InstantSchemaDef } from '@instantdb/vue';
import config from './config';

const STORAGE_KEY = 'sb-vue-vite-ephemeral-app';

type EphemeralApp = { id: string; 'admin-token': string };

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
  return r.json();
}

async function verifyEphemeralApp(appId: string) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw await r.json();
  return r.json();
}

async function getOrCreateApp(): Promise<EphemeralApp> {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const app = JSON.parse(saved) as EphemeralApp;
      await verifyEphemeralApp(app.id);
      return app;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const res = await provisionEphemeralApp(schema);
  if (!res.app) throw new Error('Could not create ephemeral app');
  const app: EphemeralApp = res.app;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
  return app;
}

export type DB = ReturnType<typeof init<AppSchema>>;

export const isLoading = ref(true);
export const error = ref<string | null>(null);
export const db = shallowRef<DB | null>(null);

getOrCreateApp()
  .then((app) => {
    db.value = init({
      ...config,
      appId: app.id,
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
  location.reload();
}

export type { AppSchema };

import { createSignal } from 'solid-js';
import { init, i, type InstantSchemaDef } from '@instantdb/solidjs';
import config from './config';

const STORAGE_KEY = 'sb-solid-vite-ephemeral-app';

type EphemeralApp = { id: string; 'admin-token': string };

const schema = i.schema({
  entities: {
    items: i.entity({
      value: i.number().indexed(),
    }),
  },
});

const perms = {
  $streams: {
    allow: {
      create: 'true',
      view: 'true',
    },
  },
};

type AppSchema = typeof schema;

async function provisionEphemeralApp(schema: InstantSchemaDef<any, any, any>) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Solid Sandbox',
      schema,
      rules: { code: perms },
    }),
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

const [dbState, setDbState] = createSignal<{
  isLoading: boolean;
  db: DB | null;
  error: string | null;
}>({ isLoading: true, db: null, error: null });

export { dbState };

export function resetEphemeralApp() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

getOrCreateApp()
  .then((app) => {
    const db = init({
      ...config,
      appId: app.id,
      schema,
      devtool: false,
    });
    setDbState({ isLoading: false, db, error: null });
  })
  .catch((e) => {
    setDbState({ isLoading: false, db: null, error: (e as Error).message });
  });

import { init, i, type InstantSchemaDef } from '@instantdb/svelte';
import config from './config';

const STORAGE_KEY = 'sb-sveltekit-ephemeral-app';

type EphemeralApp = { id: string; 'admin-token': string };

const schema = i.schema({
  entities: {
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.number(),
    }),
  },
});

type AppSchema = typeof schema;

async function provisionEphemeralApp(schema: InstantSchemaDef<any, any, any>) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'SvelteKit Sandbox', schema }),
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

type DB = ReturnType<typeof init<AppSchema>>;

export const dbState: {
  isLoading: boolean;
  db: DB | null;
  error: string | null;
} = $state({ isLoading: true, db: null, error: null });

getOrCreateApp()
  .then((app) => {
    dbState.db = init({
      ...config,
      appId: app.id,
      schema,
      devtool: false,
    });
    dbState.isLoading = false;
  })
  .catch((e) => {
    dbState.error = (e as Error).message;
    dbState.isLoading = false;
  });

export { schema, type AppSchema };

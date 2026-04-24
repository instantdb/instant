import { init } from '@instantdb/react';
import schema from './instant.schema';
import { getConfig } from '@/lib/config';

const appId =
  process.env.NEXT_PUBLIC_FEEDBACK_APP_ID ||
  '5d9c6277-e6ac-42d6-8e51-2354b4870c05';

type ClientDB = ReturnType<typeof init<typeof schema>>;

// Lazy initialization to support runtime config in self-hosted mode
let _clientDB: ClientDB | null = null;

export function getClientDB(): ClientDB {
  if (!_clientDB) {
    const config = getConfig();
    _clientDB = init({
      appId,
      schema,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
    });
  }
  return _clientDB;
}

// Used for the star count in dev, since the local db won't get updated
// In prod, prodDB will use the same instance as the clientDB
export const prodDB = init({
  appId,
  schema,
});

// For backward compatibility, export a proxy that lazily forwards to getClientDB()
// This allows the db to be imported at module level but initialized later
const clientDBProxy = new Proxy({} as ClientDB, {
  get(_, prop) {
    const db = getClientDB();
    const value = (db as any)[prop];
    // Bind methods to the db instance
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  },
});

export default clientDBProxy;

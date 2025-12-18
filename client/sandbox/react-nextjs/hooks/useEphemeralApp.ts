import { useEffect, useState, useCallback } from 'react';
import { i } from '@instantdb/react';
import config from '../config';
import { provisionEphemeralApp } from '../components/EphemeralAppPage';

type EphemeralApp = { id: string; 'admin-token': string };

async function verifyEphemeralApp({ appId }: { appId: string }) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = await r.json();

  if (!r.ok) {
    throw data;
  }
  return data;
}

export function useEphemeralApp({
  storageKey,
  schema = i.schema({ entities: {} }),
}: {
  storageKey: string;
  schema?: ReturnType<typeof i.schema>;
}) {
  const [app, setApp] = useState<EphemeralApp | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const provisionNewApp = useCallback(async () => {
    try {
      const res = await provisionEphemeralApp({ schema });
      if (res.app) {
        localStorage.setItem(storageKey, JSON.stringify(res.app));
        setApp(res.app);
      } else {
        setError(new Error('Could not create app'));
      }
    } catch (e) {
      console.error('Error creating app', e);
      setError(e as Error);
    }
  }, [storageKey, schema]);

  const resetApp = useCallback(() => {
    if (
      confirm(
        'Are you sure you want to reset the app? This will delete all data and create a new app.',
      )
    ) {
      if (app?.id) {
        const dbName = `instant_${app.id}_5`;
        const deleteRequest = indexedDB.deleteDatabase(dbName);
        deleteRequest.onsuccess = () => {
          console.log(`Deleted IndexedDB database: ${dbName}`);
        };
        deleteRequest.onerror = () => {
          console.error(`Failed to delete IndexedDB database: ${dbName}`);
        };
      }
      localStorage.removeItem(storageKey);
      setApp(null);
      setResetKey((k) => k + 1);
    }
  }, [app?.id, storageKey]);

  useEffect(() => {
    const savedApp = localStorage.getItem(storageKey);

    if (savedApp) {
      try {
        const parsedApp = JSON.parse(savedApp);
        verifyEphemeralApp({ appId: parsedApp.id })
          .then(() => {
            setApp(parsedApp);
          })
          .catch((err) => {
            if (
              err.type === 'record-not-found' ||
              err.type === 'param-malformed'
            ) {
              console.log('Saved app is invalid, provisioning new one');
              localStorage.removeItem(storageKey);
              provisionNewApp();
            } else if (!err.type) {
              // Some other error, maybe offline - trust the saved app
              setApp(parsedApp);
            } else {
              console.error('Error verifying app:', err);
              provisionNewApp();
            }
          });
      } catch (e) {
        console.error('Error parsing saved app:', e);
        localStorage.removeItem(storageKey);
        provisionNewApp();
      }
    } else {
      provisionNewApp();
    }
  }, [resetKey, storageKey, provisionNewApp]);

  return {
    app,
    appId: app?.id ?? null,
    adminToken: app?.['admin-token'] ?? null,
    error,
    isLoading: !app && !error,
    resetApp,
  };
}

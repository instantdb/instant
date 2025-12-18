'use client';

import {
  EntityDef,
  i,
  init,
  InstantReactAbstractDatabase,
} from '@instantdb/react';
import React, { useEffect, useRef, useState } from 'react';
import config from '../../config';
import { provisionEphemeralApp } from '../../components/EphemeralAppPage';
import { Explorer, Toaster } from '@instantdb/components';
function Main({
  appId,
  adminToken,
}: {
  onResetApp: () => void;
  appId: string;
  adminToken: string;
}) {
  return (
    <div className="min-h-screen">
      <Explorer appId={appId} adminToken={adminToken} useShadowDOM={true} />
      <Toaster />
    </div>
  );
}

const STORAGE_KEY = 'sync-table-ephemeral-app';

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

function App() {
  const [app, setApp] = useState<{ id: string; 'admin-token': string } | null>(
    null,
  );
  const [error, setError] = useState<null | Error>(null);
  const [resetKey, setResetKey] = useState(0);

  const handleResetApp = () => {
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
      localStorage.removeItem(STORAGE_KEY);
      setApp(null);
      setResetKey((k) => k + 1);
    }
  };

  const provisionNewApp = async () => {
    try {
      const res = await provisionEphemeralApp({
        schema: i.schema({ entities: {} }),
      });
      if (res.app) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(res.app));
        setApp(res.app);
      } else {
        setError(new Error('Could not create app'));
      }
    } catch (e) {
      console.error('Error creating app', e);
      setError(e as Error);
    }
  };

  useEffect(() => {
    const savedApp = localStorage.getItem(STORAGE_KEY);

    if (savedApp) {
      try {
        const parsedApp = JSON.parse(savedApp);
        verifyEphemeralApp({ appId: parsedApp.id })
          .then((res) => {
            setApp(parsedApp);
          })
          .catch((err) => {
            if (
              err.type === 'record-not-found' ||
              err.type === 'param-malformed'
            ) {
              console.log('Saved app is invalid, provisioning new one');
              localStorage.removeItem(STORAGE_KEY);
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
        localStorage.removeItem(STORAGE_KEY);
        provisionNewApp();
      }
    } else {
      provisionNewApp();
    }
  }, [resetKey]);

  if (error) {
    return <div>There was an error {error.message}</div>;
  }

  if (app) {
    return (
      <Main
        onResetApp={handleResetApp}
        appId={app.id}
        adminToken={app['admin-token']}
      />
    );
  }
  return <div className="mx-auto flex max-w-lg flex-col">Loading...</div>;
}

export default App;

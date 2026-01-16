import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import config from '../../config';
import { id, i, init, tx } from '@instantdb/react';
import { provisionEphemeralApp } from '../../components/EphemeralAppPage';

const schemaV0 = i.schema({
  entities: {
    exercises: i.entity({
      title: i.string(),
    }),
  },
});

const schemaV1 = i.schema({
  entities: {
    exercises: i.entity({
      title: i.string(),
    }),
    workouts: i.entity({
      name: i.string(),
    }),
  },
});

type AppInfo = { id: string; 'admin-token': string };

function hasAttr(attrs: Record<string, any>, etype: string, label: string) {
  return Object.values(attrs || {}).some((attr: any) => {
    const fwd = attr?.['forward-identity'];
    return fwd && fwd[1] === etype && fwd[2] === label;
  });
}

export default function Page() {
  const router = useRouter();
  const [app, setApp] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attrs, setAttrs] = useState<Record<string, any>>({});
  const [pushed, setPushed] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const db = useMemo(() => {
    if (!app) return null;
    return init({ ...config, appId: app.id, schema: schemaV1 });
  }, [app]);

  useEffect(() => {
    if (!db) return;
    const unsub = db._core._reactor.subscribeAttrs((nextAttrs: any) => {
      setAttrs(nextAttrs || {});
    });
    return unsub;
  }, [db]);

  const appendLog = (line: string) => {
    setLog((prev) => [`${new Date().toISOString()} ${line}`, ...prev]);
  };

  const provision = async () => {
    setError(null);
    setLastError(null);
    setPushed(false);
    setAttrs({});
    setLog([]);
    try {
      const res = await provisionEphemeralApp({ schema: schemaV0 });
      if (!res?.app) {
        setError('Failed to provision app');
        return;
      }
      setApp(res.app as AppInfo);
      if (router.isReady) {
        router.replace({
          pathname: router.pathname,
          query: { ...router.query, app: res.app.id },
        });
      }
      appendLog('provisioned app with schemaV0 (no workouts)');
    } catch (e: any) {
      setError(e?.message || 'Failed to provision app');
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    provision();
  }, [router.isReady]);

  const pushSchema = async () => {
    if (!app) return;
    setLastError(null);
    try {
      const response = await fetch(
        `${config.apiURI}/dash/apps/${app.id}/schema/push/apply`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${app['admin-token']}`,
            'content-type': 'application/json',
            'app-id': app.id,
          },
          body: JSON.stringify({ schema: schemaV1 }),
        },
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body?.message || 'schema push failed');
      }
      setPushed(true);
      appendLog('pushed schemaV1 to server (workouts added)');
    } catch (e: any) {
      const message = e?.message || 'schema push failed';
      setLastError(message);
      appendLog(`schema push error: ${message}`);
    }
  };

  const transactWorkout = async () => {
    if (!db) return;
    setLastError(null);
    try {
      await db.transact(
        tx.workouts[id()].update({
          name: `row-${Math.floor(Math.random() * 1000)}`,
        }),
      );
      appendLog('transact workouts: ok');
    } catch (e: any) {
      const message =
        e?.body?.message || e?.message || 'transact workouts failed';
      setLastError(message);
      appendLog(`transact workouts error: ${message}`);
    }
  };

  const hasWorkoutId = hasAttr(attrs, 'workouts', 'id');

  if (error) {
    return <div>There was an error: {error}</div>;
  }

  if (!app || !db) {
    return <div>Loading...</div>;
  }

  return (
    <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Schema Push + Stale Attrs Demo</h1>
      <p className="text-sm text-gray-600">
        Goal: push schema on server after init, then transact a new entity while
        local attrs are still stale. This should trigger a
        &quot;record-not-unique&quot; error for <code>workouts.id</code>.
      </p>

      <div className="rounded border p-3">
        <div className="text-sm">
          <div>
            <strong>App:</strong> {app.id}
          </div>
          <div>
            <strong>Server schema pushed?</strong> {String(pushed)}
          </div>
          <div>
            <strong>Local has workouts.id?</strong> {String(hasWorkoutId)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="bg-black px-3 py-2 text-white" onClick={provision}>
          Provision new app
        </button>
        <button className="bg-black px-3 py-2 text-white" onClick={pushSchema}>
          Push schema V1 to server
        </button>
        <button
          className="bg-black px-3 py-2 text-white"
          onClick={transactWorkout}
        >
          Transact workouts
        </button>
      </div>

      {lastError ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {lastError}
        </div>
      ) : null}

      <div className="rounded border p-3 text-sm">
        <div className="mb-2 font-semibold">Log</div>
        <pre className="whitespace-pre-wrap">{log.join('\n')}</pre>
      </div>
    </div>
  );
}

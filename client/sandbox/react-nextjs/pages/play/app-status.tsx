import { useEffect, useState } from 'react';
import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import EphemeralAppPage from '../../components/EphemeralAppPage';
import config from '../../config';

const schema = i.schema({
  entities: {
    docs: i.entity({
      title: i.string(),
    }),
  },
});

const perms = {
  docs: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
    },
  },
};

type AppStatus = 'active' | 'read-only' | 'disabled';

const statuses: AppStatus[] = ['active', 'read-only', 'disabled'];

async function setAppStatus(appId: string, status: AppStatus) {
  const adminToken = localStorage.getItem(`ephemeral-admin-token-${appId}`);
  const r = await fetch(
    `${config.apiURI}/dash/apps/ephemeral/${appId}/status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, 'admin-token': adminToken }),
    },
  );
  const res = await r.json();
  if (!r.ok) {
    throw new Error(res.message || 'Could not set status');
  }
  return res;
}

function Badge({ label, tone }: { label: string; tone: string }) {
  const colors: Record<string, string> = {
    good: 'bg-green-100 text-green-800',
    warn: 'bg-yellow-100 text-yellow-800',
    bad: 'bg-red-100 text-red-800',
    loading: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`rounded px-2 py-1 font-mono text-sm ${colors[tone]}`}>
      {label}
    </span>
  );
}

function App({
  db,
  appId,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  appId: string;
}) {
  const { isLoading: statusLoading, isReadOnly } = db.useAppStatus();
  const connectionStatus = db.useConnectionStatus();
  const { isLoading, error, data } = db.useQuery({ docs: {} });
  // The public API collapses `disabled` away, so the operator toggle reads
  // the reactor's raw status directly
  const [serverStatus, setServerStatus] = useState<AppStatus | undefined>();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [lastTransact, setLastTransact] = useState<string | null>(null);

  useEffect(() => {
    const reactor = (db as any).core._reactor;
    setServerStatus(reactor._appStatusState.status);
    return reactor.subscribeAppStatus((state: any) =>
      setServerStatus(state.status),
    );
  }, [db]);

  const toggle = async (status: AppStatus) => {
    setToggleError(null);
    try {
      await setAppStatus(appId, status);
    } catch (e) {
      setToggleError((e as Error).message);
    }
  };

  const addDoc = async () => {
    setLastTransact(null);
    try {
      await db.transact(
        db.tx.docs[id()].update({ title: `doc ${Date.now()}` }),
      );
      setLastTransact('ok');
    } catch (e: any) {
      setLastTransact(`rejected: ${e.message}`);
    }
  };

  const deleteDocs = async () => {
    setLastTransact(null);
    try {
      const docs = data?.docs || [];
      await db.transact(docs.map((d) => db.tx.docs[d.id].delete()));
      setLastTransact('ok');
    } catch (e: any) {
      setLastTransact(`rejected: ${e.message}`);
    }
  };

  return (
    <div className="mx-auto mt-10 flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-bold">Maintenance mode playground</h1>

      <div className="flex items-center gap-2">
        <span>useAppStatus:</span>
        {statusLoading ? (
          <Badge label="loading" tone="loading" />
        ) : (
          <Badge
            label={isReadOnly ? 'read-only' : 'writable'}
            tone={isReadOnly ? 'warn' : 'good'}
          />
        )}
        <span className="ml-4">Connection:</span>
        <Badge
          label={connectionStatus}
          tone={connectionStatus === 'authenticated' ? 'good' : 'loading'}
        />
      </div>

      <div>
        <div className="mb-1 text-sm text-gray-500">
          Operator toggle (server-side status):
        </div>
        <div className="flex gap-2">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={`rounded border p-2 ${
                serverStatus === s ? 'bg-black text-white' : 'bg-white'
              }`}
            >
              Set {s}
            </button>
          ))}
        </div>
      </div>
      {toggleError ? (
        <div className="text-red-600">Toggle failed: {toggleError}</div>
      ) : null}

      <div className="flex gap-2">
        <button className="rounded border bg-white p-2" onClick={addDoc}>
          Add doc
        </button>
        <button className="rounded border bg-white p-2" onClick={deleteDocs}>
          Delete all docs
        </button>
      </div>
      {lastTransact ? (
        <div
          className={lastTransact === 'ok' ? 'text-green-700' : 'text-red-600'}
        >
          Last transact: {lastTransact}
        </div>
      ) : null}

      <div>
        <div className="font-bold">Query state</div>
        {isLoading ? (
          <div>Loading...</div>
        ) : error ? (
          <div className="text-red-600">Query error: {error.message}</div>
        ) : (
          <pre className="overflow-auto rounded bg-gray-100 p-2 text-xs">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>

      <div className="text-sm text-gray-500">
        Try: set read-only and click "Add doc" (rejected, reads keep working).
        Set disabled and reload the page (queries error; the SDK still just
        reports read-only). Set active again and watch everything recover.
      </div>
    </div>
  );
}

export default function Page() {
  return <EphemeralAppPage schema={schema} perms={perms} Component={App} />;
}

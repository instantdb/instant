import Head from 'next/head';
import { id, i, init, type Logger } from '@instantdb/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import config from '../../config';
import { useEphemeralApp } from '../../hooks/useEphemeralApp';

const schema = i.schema({
  entities: {
    proxyChecks: i.entity({
      label: i.string(),
      createdAt: i.number(),
    }),
  },
});

const perms = {
  proxyChecks: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
    },
  },
};

type Event = {
  at: string;
  message: string;
  type: 'info' | 'success' | 'error';
};

function responseError(response: Response, body: string) {
  return new Error(
    `${response.status} ${response.statusText}${body ? `: ${body}` : ''}`,
  );
}

function responseServerPort(response: Response) {
  const value = response.headers.get('x-instant-server-port');
  if (!value) {
    throw new Error('response did not identify its backend');
  }
  return Number(value);
}

function ProxyChecks({
  appId,
  adminToken,
  onReset,
}: {
  appId: string;
  adminToken: string;
  onReset?: () => void;
}) {
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const logger = useMemo<Logger>(
    () => ({
      info: (event, _connectionId, op, message) => {
        if (event === '[receive]' && op === 'init-ok') {
          const port = message?.['server-port'];
          setServerPort(typeof port === 'number' ? port : null);
        }
      },
      debug: () => {},
      error: () => {},
    }),
    [],
  );
  const db = useMemo(
    () =>
      init({
        ...config,
        appId,
        schema,
        devtool: false,
        verbose: true,
        logger,
      }),
    [appId, logger],
  );
  const connectionStatus = db.useConnectionStatus();
  const query = db.useQuery({ proxyChecks: {} });

  const addEvent = useCallback(
    (message: string, type: Event['type'] = 'info') => {
      setEvents((current) =>
        [
          {
            at: new Date().toLocaleTimeString(),
            message,
            type,
          },
          ...current,
        ].slice(0, 30),
      );
    },
    [],
  );

  useEffect(() => {
    if (connectionStatus === 'authenticated') {
      if (serverPort) {
        addEvent(`WebSocket authenticated on backend ${serverPort}`, 'success');
      }
      return;
    }
    addEvent(`WebSocket is ${connectionStatus}`);
  }, [addEvent, connectionStatus, serverPort]);

  useEffect(() => {
    return () => db.core.shutdown();
  }, [db]);

  const run = async (name: string, check: () => Promise<void>) => {
    setBusy(name);
    try {
      await check();
    } catch (error) {
      addEvent(`${name}: ${(error as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const transactionCheck = async () => {
    const checkId = id();
    const label = `check-${new Date().toISOString()}`;
    await db.transact(
      db.tx.proxyChecks[checkId].update({
        label,
        createdAt: Date.now(),
      }),
    );
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await db.queryOnce({ proxyChecks: {} });
      if (result.data.proxyChecks.some((check) => check.id === checkId)) {
        if (!serverPort) {
          throw new Error('init-ok did not identify its backend');
        }
        addEvent(
          `Transaction and query passed through backend ${serverPort}`,
          'success',
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('transaction committed but the record was not queried');
  };

  const adminQueryCheck = async () => {
    const response = await fetch(`${config.apiURI}/admin/query`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'app-id': appId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: { proxyChecks: {} } }),
    });
    const body = await response.text();
    if (!response.ok) {
      throw responseError(response, body);
    }
    const port = responseServerPort(response);
    addEvent(`Admin query passed through backend ${port}`, 'success');
  };

  const uploadCheck = async () => {
    const path = `app-proxy-check-${Date.now()}.txt`;
    const headers = {
      authorization: `Bearer ${adminToken}`,
      'app-id': appId,
    };
    const uploadResponse = await fetch(
      `${config.apiURI}/admin/storage/upload`,
      {
        method: 'PUT',
        headers: {
          ...headers,
          'content-type': 'text/plain',
          path,
        },
        body: 'App proxy playground upload',
      },
    );
    const uploadBody = await uploadResponse.text();
    if (!uploadResponse.ok) {
      throw responseError(uploadResponse, uploadBody);
    }
    const uploadPort = responseServerPort(uploadResponse);

    const deleteResponse = await fetch(
      `${config.apiURI}/admin/storage/files?filename=${encodeURIComponent(path)}`,
      {
        method: 'DELETE',
        headers,
      },
    );
    const deleteBody = await deleteResponse.text();
    if (!deleteResponse.ok) {
      throw responseError(deleteResponse, deleteBody);
    }
    const deletePort = responseServerPort(deleteResponse);
    addEvent(
      `Upload passed through backend ${uploadPort}; cleanup used ${deletePort}`,
      'success',
    );
  };

  const runAll = () =>
    run('Full check', async () => {
      if (connectionStatus !== 'authenticated') {
        throw new Error(`WebSocket is ${connectionStatus}`);
      }
      if (!serverPort) {
        throw new Error('init-ok did not identify its backend');
      }
      await transactionCheck();
      await adminQueryCheck();
      await uploadCheck();
      addEvent('All end-to-end checks passed', 'success');
    });

  const buttonClass =
    'rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40';
  const connected = connectionStatus === 'authenticated';
  const connectionIdentified = connected && serverPort !== null;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-12 text-zinc-900">
      <div>
        <h1 className="text-3xl font-bold">App proxy playground</h1>
        <p className="mt-2 text-sm text-zinc-600">
          All SDK and admin traffic starts at {config.apiURI}. Add this app to
          the app proxy config, then run the checks before and after cutover.
        </p>
      </div>

      <section className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-3">
        <div>
          <div className="text-xs font-medium text-zinc-500 uppercase">
            Init backend
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {serverPort ?? 'unknown'}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-500 uppercase">
            WebSocket status
          </div>
          <div className="mt-1 text-2xl font-semibold">{connectionStatus}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-zinc-500 uppercase">
            Live records
          </div>
          <div className="mt-1 text-2xl font-semibold">
            {query.data?.proxyChecks.length ?? 0}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 text-sm font-semibold">End-to-end checks</div>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonClass}
            disabled={Boolean(busy) || !connectionIdentified}
            onClick={() => run('Transaction', transactionCheck)}
          >
            Transaction + query
          </button>
          <button
            className={buttonClass}
            disabled={Boolean(busy)}
            onClick={() => run('Admin query', adminQueryCheck)}
          >
            Admin query
          </button>
          <button
            className={buttonClass}
            disabled={Boolean(busy)}
            onClick={() => run('Upload', uploadCheck)}
          >
            Upload + delete
          </button>
          <button
            className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={Boolean(busy) || !connectionIdentified}
            onClick={runAll}
          >
            {busy === 'Full check' ? 'Running…' : 'Run all'}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Disposable app</div>
            <code className="text-xs text-zinc-500">{appId}</code>
          </div>
          <div className="flex gap-2">
            {onReset && (
              <>
                <a
                  className={buttonClass}
                  href={`/play/app-proxy?app_id=${encodeURIComponent(appId)}#admin_token=${encodeURIComponent(adminToken)}`}
                >
                  Open pinned app
                </a>
                <button
                  className={buttonClass}
                  disabled={Boolean(busy)}
                  onClick={onReset}
                >
                  Reset app
                </button>
              </>
            )}
          </div>
        </div>
        {query.error && (
          <div className="text-sm text-red-700">{query.error.message}</div>
        )}
        <div className="max-h-52 overflow-auto rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
          {events.length === 0 ? (
            <div className="text-zinc-500">Waiting for events…</div>
          ) : (
            events.map((event, index) => (
              <div
                key={`${event.at}-${index}`}
                className={
                  event.type === 'error'
                    ? 'text-red-300'
                    : event.type === 'success'
                      ? 'text-emerald-300'
                      : 'text-zinc-300'
                }
              >
                {event.at} {event.message}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function EphemeralProxyChecks() {
  const { appId, adminToken, error, isLoading, resetApp } = useEphemeralApp({
    storageKey: 'app-proxy-playground-app',
    schema,
    perms,
  });

  return (
    <div>
      {isLoading && <div className="p-8">Creating a disposable app…</div>}
      {error && <div className="p-8 text-red-700">{error.message}</div>}
      {appId && adminToken && (
        <ProxyChecks
          key={appId}
          appId={appId}
          adminToken={adminToken}
          onReset={resetApp}
        />
      )}
    </div>
  );
}

export default function AppProxyPage() {
  const [configuredApp, setConfiguredApp] = useState<{
    appId: string;
    adminToken: string;
  } | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlReady, setUrlReady] = useState(false);

  useEffect(() => {
    const appId = new URLSearchParams(window.location.search).get('app_id');
    const adminToken = new URLSearchParams(window.location.hash.slice(1)).get(
      'admin_token',
    );

    if (appId || adminToken) {
      if (appId && adminToken) {
        setConfiguredApp({ appId, adminToken });
      } else {
        setUrlError(
          'A pinned app URL requires app_id and an admin_token fragment.',
        );
      }
    }
    setUrlReady(true);
  }, []);

  return (
    <>
      <Head>
        <title>App proxy playground</title>
      </Head>
      {!urlReady && <div className="p-8">Loading app…</div>}
      {urlReady && urlError && (
        <div className="p-8 text-red-700">{urlError}</div>
      )}
      {urlReady &&
        !urlError &&
        (configuredApp ? (
          <ProxyChecks
            appId={configuredApp.appId}
            adminToken={configuredApp.adminToken}
          />
        ) : (
          <EphemeralProxyChecks />
        ))}
    </>
  );
}

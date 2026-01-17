import { useEffect, useRef, useState } from 'react';
import { id, init } from '@instantdb/react';
import config from '../../config';
import EphemeralAppPage, {
  provisionEphemeralApp,
} from '../../components/EphemeralAppPage';

function SoftDeleteTest({ db, appId, adminToken }: any) {
  const [attrs, setAttrs] = useState<any[]>([]);
  const [softDeletedAttrs, setSoftDeletedAttrs] = useState<any[]>([]);
  const [nsName, setNsName] = useState('test_namespace');
  const [attrName, setAttrName] = useState('test_attr');
  const [isPolling, setIsPolling] = useState(true);
  db.useQuery({ ___explorer___: {} });
  // Subscribe to attrs
  useEffect(() => {
    if (!db) return;

    const unsubscribe = db._core._reactor.subscribeAttrs((newAttrs: any) => {
      const attrsList = Object.values(newAttrs || {}).filter(
        (x: any) => x.catalog !== 'system',
      );
      setAttrs(attrsList);
      console.log('Subscribed attrs:', attrsList);
    });

    return unsubscribe;
  }, [db]);

  // Poll for soft-deleted attrs
  useEffect(() => {
    if (!isPolling || !adminToken) return;

    const pollSoftDeleted = async () => {
      try {
        const response = await fetch(
          `${config.apiURI}/admin/soft_deleted_attrs`,
          {
            method: 'GET',
            headers: {
              'app-id': appId,
              authorization: `Bearer ${adminToken}`,
            },
          },
        );
        const data = await response.json();
        setSoftDeletedAttrs(data['attrs'] || []);
        console.log('Soft-deleted attrs:', data['attrs']);
      } catch (error) {
        console.error('Error fetching soft-deleted attrs:', error);
      }
    };

    // Initial poll
    pollSoftDeleted();

    // Poll every 2 seconds
    const interval = setInterval(pollSoftDeleted, 2000);

    return () => clearInterval(interval);
  }, [isPolling, appId, adminToken]);

  const createAttr = async () => {
    if (!db) return;

    try {
      await db.transact(db.tx[nsName][id()].update({ [attrName]: 'v' }));
      console.log('Created attr');
    } catch (error) {
      console.error('Error creating attr:', error);
    }
  };

  const deleteAttr = async (attrId: string) => {
    if (!db) return;

    try {
      await db._core._reactor.pushOps([['delete-attr', attrId]]);
      console.log('Deleted attr:', attrId);
      // Start polling after delete
      setIsPolling(true);
    } catch (error) {
      console.error('Error deleting attr:', error);
    }
  };

  const restoreAttr = async (attrId: string) => {
    if (!db) return;

    try {
      await db._core._reactor.pushOps([['restore-attr', attrId]]);
      console.log('Restored attr:', attrId);
    } catch (error) {
      console.error('Error restoring attr:', error);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Soft Delete Test</h1>

      {/* Create Attr Section */}
      <div className="rounded border p-4">
        <h2 className="mb-2 text-lg font-semibold">Create Attr</h2>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Namespace name"
            value={nsName}
            onChange={(e) => setNsName(e.target.value)}
            className="rounded border px-2 py-1"
          />
          <input
            type="text"
            placeholder="Attr name"
            value={attrName}
            onChange={(e) => setAttrName(e.target.value)}
            className="rounded border px-2 py-1"
          />
          <button
            onClick={createAttr}
            className="rounded bg-blue-500 px-4 py-1 text-white hover:bg-blue-600"
          >
            Create Attr
          </button>
        </div>
      </div>

      {/* Subscribed Attrs Section */}
      <div className="rounded border p-4">
        <h2 className="mb-2 text-lg font-semibold">
          Subscribed Attrs ({attrs.length})
        </h2>
        <div className="space-y-2">
          {attrs.map((attr: any) => (
            <div
              key={attr.id}
              className="flex items-center justify-between rounded bg-gray-50 p-2"
            >
              <div>
                <span className="font-mono text-sm">
                  {attr['forward-identity']?.[1]}.
                  {attr['forward-identity']?.[2]}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  ID: {attr.id}
                </span>
              </div>
              <button
                onClick={() => deleteAttr(attr.id)}
                className="rounded bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          ))}
          {attrs.length === 0 && (
            <div className="text-gray-500">No attrs yet. Create one above.</div>
          )}
        </div>
      </div>

      {/* Polling Controls */}
      <div className="rounded border p-4">
        <h2 className="mb-2 text-lg font-semibold">Polling Controls</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPolling(!isPolling)}
            className={`rounded px-4 py-1 ${
              isPolling
                ? 'bg-gray-500 text-white hover:bg-gray-600'
                : 'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {isPolling ? 'Stop Polling' : 'Start Polling'}
          </button>
          <span className="text-sm text-gray-500">
            {isPolling ? 'Polling every 2s' : 'Not polling'}
          </span>
        </div>
      </div>

      {/* Soft-Deleted Attrs Section */}
      <div className="rounded border p-4">
        <h2 className="mb-2 text-lg font-semibold">
          Soft-Deleted Attrs ({softDeletedAttrs.length})
        </h2>
        <div className="space-y-2">
          {softDeletedAttrs.map((attr: any) => (
            <div
              key={attr.id}
              className="flex items-center justify-between rounded bg-red-50 p-2"
            >
              <div>
                <span className="font-mono text-sm line-through">
                  {attr['forward-identity'][1]}.{attr['forward-identity'][2]}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  ID: {attr.id}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  Marked at:{' '}
                  {new Date(attr['deletion-marked-at']).toLocaleString()}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => restoreAttr(attr.id)}
                  className="rounded bg-green-500 px-3 py-1 text-sm text-white hover:bg-green-600"
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
          {softDeletedAttrs.length === 0 && isPolling && (
            <div className="text-gray-500">No soft-deleted attrs found.</div>
          )}
          {!isPolling && (
            <div className="text-gray-500">
              Start polling to see soft-deleted attrs.
            </div>
          )}
        </div>
      </div>

      {/* Debug Info */}
      <div className="rounded border bg-gray-100 p-4">
        <h2 className="mb-2 text-lg font-semibold">Debug Info</h2>
        <div className="space-y-1 font-mono text-xs">
          <div>App ID: {appId}</div>
          <div>Admin Token: {adminToken ? '✓' : '✗'}</div>
          <div>DB Connected: {db ? '✓' : '✗'}</div>
        </div>
      </div>
    </div>
  );
}

function App({ app }: { app: { id: string; 'admin-token': string } }) {
  const db = useRef(
    init({
      ...config,
      appId: app.id,
      // @ts-ignore
      __adminToken: app['admin-token'],
    }),
  );
  return (
    <SoftDeleteTest
      db={db.current}
      appId={app.id}
      adminToken={app['admin-token']}
    />
  );
}

export default function Page() {
  const [app, setApp] = useState(null);
  const [error, setError] = useState<null | Error>(null);
  useEffect(() => {
    provisionEphemeralApp({})
      .then((res) => setApp(res.app))
      .catch((e) => {
        console.error('Error creating app', e);
        setError(e);
      });
  }, []);

  if (error) {
    return <div>There was an error {error.message}</div>;
  }

  if (app) {
    return <App app={app} />;
  }
  return <div className="mx-auto mt-20 flex max-w-lg flex-col">Loading...</div>;
}

import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import { weakHash } from '@instantdb/core';
import weakHashLegacy from '../../../../packages/core/dist/esm/utils/weakHashLegacy';
import { useEffect, useState } from 'react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    items: i.entity({
      name: i.string(),
      propertyId: i.number(),
    }),
  },
});

type Schema = typeof schema;

const PROPERTY_ID = 42;
const QUERY = { items: { $: { where: { propertyId: PROPERTY_ID } } } };

// Two queries that the pre-fix hash collided on. Useful for the
// "collision fix" section below.
const QUERY_936 = {
  pro_search_properties: {
    $: {
      where: {
        pro_searches: 'b14fae2f-ce9b-4677-b6a9-6dddd81914d0',
        propertyId: 936,
      },
    },
    pro_searches: {},
  },
};
const QUERY_27140 = {
  pro_search_properties: {
    $: {
      where: {
        pro_searches: 'b14fae2f-ce9b-4677-b6a9-6dddd81914d0',
        propertyId: 27140,
      },
    },
    pro_searches: {},
  },
};

function dbName(appId: string) {
  return `instant_${appId}_6`;
}

function openDb(appId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(appId));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function listQuerySubKeys(appId: string): Promise<string[]> {
  const db = await openDb(appId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['querySubs'], 'readonly');
    const store = tx.objectStore('querySubs');
    const req = store.getAllKeys();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as string[]).filter((k) => k !== '__meta'));
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function relocateToLegacy(appId: string, q: any): Promise<boolean> {
  const newHash = weakHash(q);
  const legacyHash = weakHashLegacy(q);
  if (newHash === legacyHash) return false;
  const db = await openDb(appId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['querySubs', '__meta' as any], 'readwrite');
    const store = tx.objectStore('querySubs');
    const get = store.get(newHash);
    get.onsuccess = () => {
      if (!get.result) {
        db.close();
        return resolve(false);
      }
      const value = get.result;
      const put = store.put(value, legacyHash);
      put.onsuccess = () => {
        const del = store.delete(newHash);
        del.onsuccess = () => {
          // Also patch __meta so PersistedObject knows about the new key
          const metaReq = store.get('__meta');
          metaReq.onsuccess = () => {
            const meta = metaReq.result;
            if (meta?.objects?.[newHash]) {
              meta.objects[legacyHash] = meta.objects[newHash];
              delete meta.objects[newHash];
              const metaPut = store.put(meta, '__meta');
              metaPut.onsuccess = () => {
                db.close();
                resolve(true);
              };
              metaPut.onerror = () => {
                db.close();
                reject(metaPut.error);
              };
            } else {
              db.close();
              resolve(true);
            }
          };
          metaReq.onerror = () => {
            db.close();
            reject(metaReq.error);
          };
        };
        del.onerror = () => {
          db.close();
          reject(del.error);
        };
      };
      put.onerror = () => {
        db.close();
        reject(put.error);
      };
    };
    get.onerror = () => {
      db.close();
      reject(get.error);
    };
  });
}

interface AppProps {
  db: InstantReactAbstractDatabase<Schema>;
  appId: string;
}

function App({ db, appId }: AppProps) {
  const { data, isLoading, error } = db.useQuery(QUERY);
  const [keys, setKeys] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('');
  const [seeded, setSeeded] = useState(false);
  const [loadStart] = useState(() => Date.now());
  const [firstDataAt, setFirstDataAt] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const k = await listQuerySubKeys(appId);
      setKeys(k);
    } catch (e) {
      setStatus(`Error reading IDB: ${(e as Error).message}`);
    }
  };

  useEffect(() => {
    refresh();
  }, [appId]);

  useEffect(() => {
    if (data?.items && data.items.length > 0 && firstDataAt === null) {
      setFirstDataAt(Date.now() - loadStart);
    }
  }, [data]);

  useEffect(() => {
    if (!isLoading && !data?.items?.length && !seeded) {
      setSeeded(true);
      db.transact([
        db.tx.items[id()].create({
          name: 'The Answer',
          propertyId: PROPERTY_ID,
        }),
      ]);
    }
  }, [isLoading, data, seeded]);

  const newHash = weakHash(QUERY);
  const legacyHash = weakHashLegacy(QUERY);

  return (
    <div
      style={{
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 920,
        margin: '0 auto',
      }}
    >
      <h2>weakHash collision fix + legacy migration</h2>
      <p style={{ color: '#666' }}>
        App ID: <code>{appId}</code>
      </p>

      <section
        style={{
          marginBottom: 24,
          padding: 16,
          border: '1px solid #ddd',
          borderRadius: 6,
        }}
      >
        <h3>1. Collision fix</h3>
        <p>
          These two queries differ only by <code>propertyId</code>. The pre-fix
          hash collided on them in production.
        </p>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={th}>propertyId</th>
              <th style={th}>weakHashLegacy</th>
              <th style={th}>weakHash (new)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>936</td>
              <td style={td}>
                <code>{weakHashLegacy(QUERY_936)}</code>
              </td>
              <td style={td}>
                <code>{weakHash(QUERY_936)}</code>
              </td>
            </tr>
            <tr>
              <td style={td}>27140</td>
              <td style={td}>
                <code>{weakHashLegacy(QUERY_27140)}</code>
              </td>
              <td style={td}>
                <code>{weakHash(QUERY_27140)}</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: 8 }}>
          Legacy hashes collide:{' '}
          <strong
            style={{
              color:
                weakHashLegacy(QUERY_936) === weakHashLegacy(QUERY_27140)
                  ? '#c00'
                  : '#080',
            }}
          >
            {weakHashLegacy(QUERY_936) === weakHashLegacy(QUERY_27140)
              ? 'yes (bug)'
              : 'no'}
          </strong>
          {' · '}
          New hashes collide:{' '}
          <strong
            style={{
              color:
                weakHash(QUERY_936) === weakHash(QUERY_27140) ? '#c00' : '#080',
            }}
          >
            {weakHash(QUERY_936) === weakHash(QUERY_27140) ? 'yes' : 'no'}
          </strong>
        </p>
      </section>

      <section
        style={{
          marginBottom: 24,
          padding: 16,
          border: '1px solid #ddd',
          borderRadius: 6,
        }}
      >
        <h3>2. Legacy cache migration</h3>

        <p>
          This page subscribes to: <code>{JSON.stringify(QUERY)}</code>
        </p>
        <ul>
          <li>
            New hash: <code>{newHash}</code>
          </li>
          <li>
            Legacy hash: <code>{legacyHash}</code>
          </li>
        </ul>

        <p>
          Query state:{' '}
          {error ? (
            <span style={{ color: '#c00' }}>error: {error.message}</span>
          ) : isLoading ? (
            'loading…'
          ) : (
            `${data?.items?.length ?? 0} item(s)`
          )}
          {firstDataAt !== null && (
            <span style={{ color: '#666' }}>
              {' '}
              (first non-empty render at +{firstDataAt}ms)
            </span>
          )}
        </p>
        <p>
          Data: <code>{JSON.stringify(data?.items ?? [])}</code>
        </p>

        <div style={{ marginTop: 12 }}>
          <strong>
            Keys currently in <code>querySubs</code> (excl. __meta):
          </strong>
          <pre
            style={{
              background: '#f6f6f6',
              padding: 8,
              maxHeight: 120,
              overflow: 'auto',
              fontSize: 12,
            }}
          >
            {keys.length ? keys.join('\n') : '(none)'}
          </pre>
          {keys.includes(newHash) && (
            <p style={{ color: '#080', margin: 0 }}>
              ✓ entry present at new hash <code>{newHash}</code>
            </p>
          )}
          {keys.includes(legacyHash) && (
            <p style={{ color: '#a60', margin: 0 }}>
              ⚠ entry present at legacy hash <code>{legacyHash}</code>
            </p>
          )}
        </div>

        <div
          style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
        >
          <button onClick={refresh}>Refresh IDB view</button>
          <button
            onClick={async () => {
              setStatus('Relocating cache entry to legacy hash…');
              try {
                const moved = await relocateToLegacy(appId, QUERY);
                await refresh();
                setStatus(
                  moved
                    ? 'Moved. Now reload the page to test the migration code.'
                    : 'No entry at the new hash yet — wait for data, then try again.',
                );
              } catch (e) {
                setStatus(`Failed: ${(e as Error).message}`);
              }
            }}
          >
            Move new → legacy (simulate old client)
          </button>
          <button onClick={() => window.location.reload()}>Reload page</button>
        </div>

        {status && <p style={{ marginTop: 8 }}>{status}</p>}

        <details style={{ marginTop: 16 }}>
          <summary>How to test the migration</summary>
          <ol>
            <li>Wait for the item to load (key appears under the new hash).</li>
            <li>
              Click <em>Move new → legacy</em>. Refresh IDB view — the entry
              should now live at the legacy hash and the new-hash key is gone.
            </li>
            <li>
              Click <em>Reload page</em>. On reload, our migration code should
              detect the legacy entry, move it back to the new hash, and the
              item should render immediately (look for a low{' '}
              <em>first non-empty render at +Xms</em> number).
            </li>
          </ol>
        </details>
      </section>

      <ResetButton label="Start over with fresh app" />
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #ddd',
  padding: '6px 8px',
};
const td: React.CSSProperties = {
  borderBottom: '1px solid #f0f0f0',
  padding: '6px 8px',
};

function Page() {
  return <EphemeralAppPage schema={schema} Component={App} />;
}

export default Page;

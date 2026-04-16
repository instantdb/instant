import {
  i,
  id,
  InstantReactAbstractDatabase,
  InstantRules,
} from '@instantdb/react';
import EphemeralAppPage from '../../components/EphemeralAppPage';
import config from '../../config';
import { useEffect, useRef, useState } from 'react';

const _schema = i.schema({
  entities: {
    todos: i.entity({
      title: i.string(),
      done: i.boolean(),
      createdAt: i.number(),
    }),
  },
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

const defaultPerms: InstantRules<AppSchema> = {
  todos: {
    allow: {
      view: 'rateLimit.viewTodos.limit(auth.id)',
      create: 'rateLimit.createTodos.limit(auth.id)',
      update: 'rateLimit.updateTodos.limit(auth.id)',
      delete: 'rateLimit.deleteTodos.limit(auth.id)',
    },
  },
  $rateLimits: {
    viewTodos: {
      limits: [
        {
          capacity: 20,
          refill: { type: 'greedy', amount: 20, period: '1 minute' },
        },
      ],
    },
    createTodos: {
      limits: [
        {
          capacity: 5,
          refill: { type: 'interval', amount: 5, period: '10 seconds' },
        },
      ],
    },
    updateTodos: {
      limits: [
        {
          capacity: 10,
          refill: { type: 'greedy', amount: 10, period: '1 minute' },
        },
      ],
    },
    deleteTodos: {
      limits: [
        {
          capacity: 3,
          refill: { type: 'interval', amount: 3, period: '30 seconds' },
        },
      ],
    },
  },
};

// ---- Perms Editor ----

function PermsEditor({ appId }: { appId: string }) {
  const [perms, setPerms] = useState<string>(
    JSON.stringify(defaultPerms, null, 2),
  );
  const [status, setStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    message?: string;
  }>({ type: 'idle' });

  const adminToken = getAdminToken(appId);

  useEffect(() => {
    if (!adminToken) return;
    fetchPerms(appId, adminToken).then((p) => {
      if (p) setPerms(JSON.stringify(p, null, 2));
    });
  }, [appId, adminToken]);

  const handlePush = async () => {
    if (!adminToken) {
      setStatus({ type: 'error', message: 'No admin token found' });
      return;
    }
    setStatus({ type: 'loading' });
    try {
      const parsed = JSON.parse(perms);
      const res = await pushPerms(appId, adminToken, parsed);
      setPerms(JSON.stringify(res, null, 2));
      setStatus({ type: 'success', message: 'Rules updated' });
    } catch (e: any) {
      setStatus({
        type: 'error',
        message: e.message || 'Failed to update rules',
      });
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <h2 style={{ margin: '8px 0' }}>Rules</h2>
      <textarea
        value={perms}
        onChange={(e) => {
          setPerms(e.target.value);
          setStatus({ type: 'idle' });
        }}
        rows={20}
        style={{
          width: '100%',
          fontFamily: 'monospace',
          fontSize: 13,
          padding: 8,
          border: '1px solid #ccc',
          borderRadius: 4,
          resize: 'vertical',
        }}
      />
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}
      >
        <button
          onClick={handlePush}
          disabled={status.type === 'loading'}
          style={{
            padding: '6px 16px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {status.type === 'loading' ? 'Pushing...' : 'Push Rules'}
        </button>
        {status.type === 'success' && (
          <span style={{ color: 'green' }}>{status.message}</span>
        )}
        {status.type === 'error' && (
          <span style={{ color: 'red' }}>{status.message}</span>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        Use <code>rateLimit.bucketName.limit(key)</code> in rules. Define
        buckets in <code>$rateLimits</code> with capacity, refill type
        (greedy/interval), amount, and period.
      </p>
    </div>
  );
}

function formatError(label: string, e: any): string {
  const retryAfter = e?.hint?.['retry-after'];
  if (retryAfter != null) {
    return `${label}: Try again in ${retryAfter} seconds`;
  }
  return `${label}: ${e.message}`;
}

// ---- Todos UI ----

function TodoApp({ db }: { db: InstantReactAbstractDatabase<typeof _schema> }) {
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const pushError = (msg: string) => {
    setErrors((prev) => [...prev, msg]);
    setTimeout(() => setErrors((prev) => prev.slice(1)), 5000);
  };

  const { isLoading, error, data } = db.useQuery({
    todos: { $: { order: { serverCreatedAt: 'asc' } } },
  });

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle('');
    try {
      await db.transact(
        db.tx.todos[id()].update({
          title,
          done: false,
          createdAt: Date.now(),
        }),
      );
    } catch (e: any) {
      pushError(formatError('Create failed', e));
    }
  };

  const handleToggle = async (todoId: string, done: boolean) => {
    try {
      await db.transact(db.tx.todos[todoId].update({ done: !done }));
    } catch (e: any) {
      pushError(formatError('Update failed', e));
    }
  };

  const handleDelete = async (todoId: string) => {
    try {
      await db.transact(db.tx.todos[todoId].delete());
    } catch (e: any) {
      pushError(formatError('Delete failed', e));
    }
  };

  const handleEditStart = (todoId: string, title: string) => {
    setEditingId(todoId);
    setEditTitle(title);
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const title = editTitle.trim();
    if (!title) return;
    try {
      await db.transact(db.tx.todos[editingId].update({ title }));
      setEditingId(null);
    } catch (e: any) {
      pushError(formatError('Update failed', e));
    }
  };

  const todos = data?.todos ?? [];

  return (
    <div>
      <h2 style={{ margin: '8px 0' }}>Todos</h2>

      {/* Create form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCreate();
        }}
        style={{ display: 'flex', gap: 8, marginBottom: 12 }}
      >
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New todo..."
          style={{
            flex: 1,
            padding: '6px 10px',
            border: '1px solid #ccc',
            borderRadius: 4,
          }}
        />
        <button
          type="submit"
          style={{
            padding: '6px 16px',
            background: '#16a34a',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Add
        </button>
      </form>

      {/* Bulk operations */}
      <SpamQueryButton db={db} pushError={pushError} />
      <SpamButton db={db} pushError={pushError} />

      {/* Error display */}
      {errors.length > 0 && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 4,
            padding: 8,
            marginBottom: 8,
          }}
        >
          {errors.map((err, i) => (
            <div key={i} style={{ color: '#dc2626', fontSize: 13 }}>
              {err}
            </div>
          ))}
        </div>
      )}

      {/* Loading / error */}
      {isLoading && <div>Loading todos...</div>}
      {error && (
        <div style={{ color: 'red' }}>Query error: {error.message}</div>
      )}

      {/* Todo list */}
      {todos.length === 0 && !isLoading && (
        <div style={{ color: '#999', padding: 8 }}>No todos yet</div>
      )}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {todos.map((todo: any) => (
          <li
            key={todo.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 0',
              borderBottom: '1px solid #eee',
            }}
          >
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => handleToggle(todo.id, todo.done)}
            />
            {editingId === todo.id ? (
              <>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditSave();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    border: '1px solid #93c5fd',
                    borderRadius: 4,
                  }}
                />
                <button
                  onClick={handleEditSave}
                  style={{
                    padding: '2px 10px',
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  style={{
                    padding: '2px 10px',
                    background: '#e5e7eb',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span
                  style={{
                    flex: 1,
                    textDecoration: todo.done ? 'line-through' : 'none',
                    color: todo.done ? '#999' : 'inherit',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleEditStart(todo.id, todo.title)}
                >
                  {todo.title}
                </span>
                <button
                  onClick={() => handleDelete(todo.id)}
                  style={{
                    padding: '2px 10px',
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Spam Buttons (for hitting rate limits) ----

function SpamQueryButton({
  db,
  pushError,
}: {
  db: InstantReactAbstractDatabase<typeof _schema>;
  pushError: (msg: string) => void;
}) {
  const [count, setCount] = useState(30);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ ok: number; err: number } | null>(
    null,
  );
  const abortRef = useRef(false);

  const handleSpam = async () => {
    setSending(true);
    abortRef.current = false;
    let ok = 0;
    let err = 0;
    for (let n = 0; n < count; n++) {
      if (abortRef.current) break;
      try {
        await db.queryOnce({ todos: {} });
        ok++;
      } catch (e: any) {
        err++;
        pushError(formatError(`Query #${n + 1}`, e));
      }
      setResults({ ok, err });
    }
    setSending(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        flexWrap: 'wrap',
      }}
    >
      <label style={{ fontSize: 13 }}>Burst query:</label>
      <input
        type="number"
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        min={1}
        max={200}
        style={{
          width: 60,
          padding: '4px 6px',
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      />
      <button
        onClick={sending ? () => (abortRef.current = true) : handleSpam}
        style={{
          padding: '4px 12px',
          background: sending ? '#dc2626' : '#8b5cf6',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        {sending ? 'Stop' : 'Send'}
      </button>
      {results && (
        <span style={{ fontSize: 13 }}>
          <span style={{ color: '#16a34a' }}>{results.ok} ok</span>
          {results.err > 0 && (
            <span style={{ color: '#dc2626', marginLeft: 4 }}>
              {results.err} failed
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function SpamButton({
  db,
  pushError,
}: {
  db: InstantReactAbstractDatabase<typeof _schema>;
  pushError: (msg: string) => void;
}) {
  const [count, setCount] = useState(10);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ ok: number; err: number } | null>(
    null,
  );
  const abortRef = useRef(false);

  const handleSpam = async () => {
    setSending(true);
    abortRef.current = false;
    let ok = 0;
    let err = 0;
    for (let n = 0; n < count; n++) {
      if (abortRef.current) break;
      try {
        await db.transact(
          db.tx.todos[id()].update({
            title: `Spam #${n + 1}`,
            done: false,
            createdAt: Date.now(),
          }),
        );
        ok++;
      } catch (e: any) {
        err++;
        pushError(formatError(`Spam #${n + 1}`, e));
      }
      setResults({ ok, err });
    }
    setSending(false);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <label style={{ fontSize: 13 }}>Burst create:</label>
      <input
        type="number"
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        min={1}
        max={200}
        style={{
          width: 60,
          padding: '4px 6px',
          border: '1px solid #ccc',
          borderRadius: 4,
        }}
      />
      <button
        onClick={sending ? () => (abortRef.current = true) : handleSpam}
        style={{
          padding: '4px 12px',
          background: sending ? '#dc2626' : '#f59e0b',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        {sending ? 'Stop' : 'Send'}
      </button>
      {results && (
        <span style={{ fontSize: 13 }}>
          <span style={{ color: '#16a34a' }}>{results.ok} ok</span>
          {results.err > 0 && (
            <span style={{ color: '#dc2626', marginLeft: 4 }}>
              {results.err} failed
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// ---- Helpers ----

function getAdminToken(appId: string): string | null {
  try {
    return localStorage.getItem(`ephemeral-admin-token-${appId}`);
  } catch {
    return null;
  }
}

async function fetchPerms(
  appId: string,
  adminToken: string,
): Promise<any | null> {
  try {
    const res = await fetch(`${config.apiURI}/superadmin/apps/${appId}/perms`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const data = await res.json();
    return data?.rules?.code ?? null;
  } catch {
    return null;
  }
}

async function pushPerms(
  appId: string,
  adminToken: string,
  perms: any,
): Promise<any> {
  const res = await fetch(`${config.apiURI}/superadmin/apps/${appId}/perms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ code: perms }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      data?.message ||
        (data?.errors
          ? data.errors.map((e: any) => e.message).join('; ')
          : 'Failed to push perms'),
    );
  }
  return data?.rules?.code ?? perms;
}

// ---- Main Page ----

function Example({
  db,
  appId,
}: {
  db: InstantReactAbstractDatabase<typeof _schema>;
  appId: string;
}) {
  return (
    <div
      style={{
        maxWidth: 700,
        margin: '0 auto',
        padding: 20,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ marginBottom: 4 }}>Rate Limit Playground</h1>
      <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
        App: <code>{appId}</code>
      </p>
      <PermsEditor appId={appId} />
      <hr
        style={{
          border: 'none',
          borderTop: '1px solid #eee',
          margin: '16px 0',
        }}
      />
      <TodoApp db={db} />
    </div>
  );
}

export default function Page() {
  return (
    <EphemeralAppPage<
      AppSchema['entities'],
      AppSchema['links'],
      AppSchema['rooms'],
      false
    >
      schema={schema}
      perms={defaultPerms}
      Component={Example}
    />
  );
}

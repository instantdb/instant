import { i, id, init, InstantReactAbstractDatabase } from '@instantdb/react';
import { useState } from 'react';
import EphemeralAppPage from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    bugReproTodos: i.entity({
      title: i.string(),
      status: i.string(),
      createdAt: i.date(),
    }),
    bugReproItems: i.entity({
      content: i.string(),
      order: i.number(),
      createdAt: i.date(),
    }),
  },
  links: {
    todoItems: {
      forward: { on: 'bugReproItems', has: 'one', label: 'todo' },
      reverse: { on: 'bugReproTodos', has: 'many', label: 'items' },
    },
  },
});

function App({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
  const [logs, setLogs] = useState<string[]>([]);
  const log = (msg: string) =>
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const { data, isLoading } = db.useQuery({ bugReproTodos: { items: {} } });
  const todos = data?.bugReproTodos ?? [];

  // ── Actions ──────────────────────────────────────────────────────────────────

  const createTodo = async (withLog: boolean) => {
    const todoId = id();
    if (withLog) log(`Creating todo...`);
    await db.transact([
      db.tx.bugReproTodos[todoId]!.create({
        title: `Todo ${todoId.slice(0, 6)}`,
        status: 'idle',
        createdAt: new Date(),
      }),
    ]);
    if (withLog) log(`Created`);
  };

  const addItemAwaited = async (
    todoId: string,
    count: number,
    withLog: boolean,
  ) => {
    if (withLog) log(`Updating status (awaited)...`);
    await db.transact([
      db.tx.bugReproTodos[todoId]!.update({ status: 'active' }),
    ]);
    if (withLog) log(`Creating item (awaited)...`);
    await db.transact([
      db.tx.bugReproItems[id()]!.create({
        content: `Item ${count + 1}`,
        order: count,
        createdAt: new Date(),
      }).link({ todo: todoId }),
    ]);
    if (withLog) log(`Done`);
  };

  const addItemNonAwaited = async (
    todoId: string,
    count: number,
    withLog: boolean,
  ) => {
    if (withLog) log(`Updating status (fire-and-forget)...`);
    db.transact([db.tx.bugReproTodos[todoId]!.update({ status: 'active' })]); // NOT awaited
    if (withLog) log(`Creating item (awaited)...`);
    await db.transact([
      db.tx.bugReproItems[id()]!.create({
        content: `Item ${count + 1}`,
        order: count,
        createdAt: new Date(),
      }).link({ todo: todoId }),
    ]);
    if (withLog) log(`Done`);
  };

  const clearAll = async () => {
    const items = todos.flatMap((t) => t.items ?? []);
    await db.transact([
      ...items.map((item) => db.tx.bugReproItems[item.id]!.delete()),
      ...todos.map((todo) => db.tx.bugReproTodos[todo.id]!.delete()),
    ]);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">v0.22.58</h1>
            <p className="text-sm text-red-400">Buggy version</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/v57"
              className="rounded bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700"
            >
              Switch to v57
            </a>
            <a
              href="/"
              className="rounded bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700"
            >
              Home
            </a>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => createTodo(false)}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm hover:bg-blue-500"
          >
            Create Todo
          </button>
          <button
            onClick={clearAll}
            className="rounded bg-gray-700 px-3 py-1.5 text-sm hover:bg-gray-600"
          >
            Clear All
          </button>
          <button
            onClick={() => location.reload()}
            className="rounded bg-gray-700 px-3 py-1.5 text-sm hover:bg-gray-600"
          >
            Refresh
          </button>
        </div>

        {/* Todos */}
        {isLoading && <p className="text-gray-500">Loading...</p>}
        {!isLoading && todos.length === 0 && (
          <p className="text-gray-600">No todos. Create one to test.</p>
        )}

        <div className="space-y-3">
          {todos.map((todo) => {
            const items = todo.items ?? [];
            return (
              <div
                key={todo.id}
                className="rounded border border-gray-800 bg-gray-900 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium">{todo.title}</span>
                  <span className="text-sm text-gray-500">
                    {items.length} items
                  </span>
                </div>

                {/* Items list */}
                {items.length > 0 && (
                  <div className="mb-4 border-l border-gray-700 pl-3">
                    {items.map((item) => (
                      <div key={item.id} className="text-sm text-gray-400">
                        {item.content}
                      </div>
                    ))}
                  </div>
                )}

                {/* Test buttons - two rows */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-xs text-red-400">
                      With setState:
                    </span>
                    <button
                      onClick={() =>
                        addItemAwaited(todo.id, items.length, true)
                      }
                      className="rounded bg-red-900 px-2 py-1 text-xs hover:bg-red-800"
                    >
                      Awaited
                    </button>
                    <button
                      onClick={() =>
                        addItemNonAwaited(todo.id, items.length, true)
                      }
                      className="rounded bg-red-900 px-2 py-1 text-xs hover:bg-red-800"
                    >
                      Non-awaited
                    </button>
                    <span className="text-xs text-red-400">← BREAKS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-xs text-green-400">
                      No setState:
                    </span>
                    <button
                      onClick={() =>
                        addItemAwaited(todo.id, items.length, false)
                      }
                      className="rounded bg-green-900 px-2 py-1 text-xs hover:bg-green-800"
                    >
                      Awaited
                    </button>
                    <button
                      onClick={() =>
                        addItemNonAwaited(todo.id, items.length, false)
                      }
                      className="rounded bg-green-900 px-2 py-1 text-xs hover:bg-green-800"
                    >
                      Non-awaited
                    </button>
                    <span className="text-xs text-green-400">← Works</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Log panel */}
        <div className="mt-6 rounded border border-gray-800 bg-gray-900 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">Debug Log</span>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              Clear
            </button>
          </div>
          <div className="max-h-32 overflow-y-auto font-mono text-xs text-gray-500">
            {logs.length === 0 ? (
              <span className="text-gray-700">No logs</span>
            ) : (
              logs.map((log, i) => <div key={i}>{log}</div>)
            )}
          </div>
        </div>

        {/* Explanation */}
        <div className="mt-6 rounded border border-red-900/50 bg-red-950/20 p-4 text-xs text-gray-400">
          <p className="mb-2 font-medium text-red-400">
            Bug: React setState breaks InstantDB reactivity
          </p>
          <p className="mb-2">
            In v0.22.58, calling{' '}
            <code className="text-red-300">setState()</code> during a
            transaction causes the UI to not update. The data persists (refresh
            to verify), but the reactive subscription fails to trigger a
            re-render.
          </p>
          <p className="font-medium text-gray-500">
            This works fine in v0.22.57 — something changed in how useQuery
            handles concurrent React renders.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <EphemeralAppPage schema={schema} Component={App} />;
}

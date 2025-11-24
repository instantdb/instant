import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';
import { useIsHydrated } from '../../lib/useIsHydrated';

const schema = i.schema({
  entities: {
    todos: i.entity({
      text: i.string(),
      completed: i.boolean().optional(),
      createdAt: i.number().optional(),
    }),
  },
});

const perms = {
  todos: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
    },
  },
};

// Generate random todo text
const randomTodoTexts = [
  'Buy groceries',
  'Walk the dog',
  'Clean the house',
  'Call mom',
  'Finish project',
  'Read a book',
  'Go to gym',
  'Cook dinner',
  'Pay bills',
  'Organize desk',
  'Water plants',
  'Schedule dentist appointment',
  'Write blog post',
  'Learn new skill',
  'Plan vacation',
];

const defaultLimit = 3;

function QueryCacheApp({
  db,
  appId,
}: {
  db: InstantReactAbstractDatabase<typeof schema>;
  appId: string;
}) {
  const router = useRouter();
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);

  // Get cache limit from URL parameter for display purposes
  const cacheLimit =
    router.query.cacheLimit && typeof router.query.cacheLimit === 'string'
      ? parseInt(router.query.cacheLimit, 10) || defaultLimit
      : defaultLimit;

  // Master query - all todos
  const {
    data: allTodos,
    isLoading: todosLoading,
    error: todosError,
  } = db.useQuery({
    todos: {},
  });

  // Detail query - specific todo if selected
  const { data: todoDetail, isLoading: detailLoading } = db.useQuery(
    selectedTodoId
      ? {
          todos: {
            $: { where: { id: selectedTodoId } },
          },
        }
      : null,
  );

  const generateRandomTodo = () => {
    const randomText =
      randomTodoTexts[Math.floor(Math.random() * randomTodoTexts.length)];
    const todoId = id();

    db.transact(
      db.tx.todos[todoId].update({
        text: `${randomText} - ${Math.floor(Math.random() * 100)}`,
        completed: false,
        createdAt: Date.now(),
      }),
    );
  };

  const deleteTodo = (todoId: string) => {
    db.transact(db.tx.todos[todoId].delete());
    if (selectedTodoId === todoId) {
      setSelectedTodoId(null);
    }
  };

  const toggleTodo = (todoId: string, completed: boolean) => {
    db.transact(db.tx.todos[todoId].update({ completed: !completed }));
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-3xl font-bold">Query Cache Test</h1>

        {/* Controls */}
        <div className="mb-6 flex items-center gap-4 border-b pb-4">
          <div className="flex flex-col">
            <label className="text-sm font-medium">
              Cache Limit:
              <input
                type="number"
                min="1"
                value={cacheLimit}
                onChange={(e) => {
                  const newLimit = parseInt(e.target.value, 10);
                  if (!isNaN(newLimit) && newLimit > 0) {
                    router.push(`?cacheLimit=${newLimit}`, undefined, {
                      shallow: true,
                    });
                  }
                }}
                className="ml-2 w-20 rounded border px-3 py-1"
              />
            </label>
            <span className="mt-1 text-xs text-gray-500">
              Changing this will spawn a new app
            </span>
          </div>
          <button
            onClick={generateRandomTodo}
            className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
          >
            🎲 Spawn Random Todo
          </button>
          <span className="text-sm text-gray-600">
            Current: <strong>{cacheLimit}</strong> queries
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Master View - All Todos */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">All Todos</h2>

            {todosLoading ? (
              <div className="text-gray-500">Loading todos...</div>
            ) : todosError ? (
              <div className="text-red-500">
                Error loading todos: {todosError.message}
              </div>
            ) : (
              <div className="space-y-2">
                {allTodos?.todos?.map((todo) => (
                  <div
                    key={todo.id}
                    className={`cursor-pointer rounded border p-3 transition-colors ${
                      selectedTodoId === todo.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedTodoId(todo.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={todo.completed || false}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleTodo(todo.id, todo.completed || false);
                          }}
                          className="h-4 w-4"
                        />
                        <span
                          className={
                            todo.completed ? 'text-gray-500 line-through' : ''
                          }
                        >
                          {todo.text}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTodo(todo.id);
                        }}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {(!allTodos?.todos || allTodos.todos.length === 0) && (
                  <div className="py-8 text-center text-gray-500">
                    No todos yet. Click "🎲 Spawn Random Todo" to create some!
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detail View - Selected Todo */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h2 className="mb-4 text-xl font-semibold">Todo Detail</h2>

            {!selectedTodoId ? (
              <div className="py-8 text-center text-gray-500">
                Select a todo from the list to view details
              </div>
            ) : detailLoading ? (
              <div className="text-gray-500">Loading todo details...</div>
            ) : todoDetail?.todos?.[0] ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    ID
                  </label>
                  <div className="rounded bg-gray-50 p-2 font-mono text-sm text-gray-600">
                    {todoDetail.todos[0].id}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Text
                  </label>
                  <div className="rounded bg-gray-50 p-2 text-sm text-gray-900">
                    {todoDetail.todos[0].text}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <div className="rounded bg-gray-50 p-2 text-sm text-gray-900">
                    {todoDetail.todos[0].completed ? 'Completed' : 'Pending'}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Created At
                  </label>
                  <div className="rounded bg-gray-50 p-2 text-sm text-gray-600">
                    {todoDetail.todos[0].createdAt
                      ? new Date(todoDetail.todos[0].createdAt).toLocaleString()
                      : 'Unknown'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-red-500">
                Todo not found or failed to load
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QueryCacheTestPage() {
  const router = useRouter();
  const isHydrated = useIsHydrated();

  // Get cache limit from URL parameter, only after hydration
  const cacheLimit =
    isHydrated &&
    router.query.cacheLimit &&
    typeof router.query.cacheLimit === 'string'
      ? parseInt(router.query.cacheLimit, 10) || defaultLimit
      : defaultLimit;

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-6">
        <h1 className="mb-4 text-2xl font-bold">Query Cache Test</h1>

        <div className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">About Query Caching</h2>
          <div className="mb-4 space-y-2 text-sm text-gray-700">
            <p>
              • Until we have single-store, we limit the number of queries we
              cache for offline use
            </p>
            <p>• This tool helps verify the caching behavior works correctly</p>
            <p>
              • By default we cache 10 queries, but you can configure this by
              passing{' '}
              <code className="rounded bg-gray-100 px-1">queryCacheLimit</code>{' '}
              to <code className="rounded bg-gray-100 px-1">init()</code>
            </p>
          </div>

          <h3 className="mb-2 font-medium">How to Test</h3>
          <ol className="list-inside list-decimal space-y-1 text-sm text-gray-700">
            <li>
              Create N+1 todos where N is the cache limit (current limit:{' '}
              <strong>{cacheLimit}</strong>)
            </li>
            <li>View all the todos to load the data into IndexedDB</li>
            <li>Turn off your dev server so you are now "offline"</li>
            <li>Refresh the page</li>
            <li>Verify that some todos will now show a loading state</li>
          </ol>
        </div>

        <p className="mb-2 text-sm text-gray-500">
          Cache limit: <strong>{cacheLimit}</strong> queries
        </p>
        {isHydrated && (
          <ResetButton className="rounded bg-gray-600 px-4 py-2 text-white" />
        )}
      </div>
      {isHydrated && (
        <EphemeralAppPage
          schema={schema}
          perms={perms}
          Component={QueryCacheApp}
          extraConfig={{ queryCacheLimit: cacheLimit }}
        />
      )}
      {!isHydrated && <div className="py-8 text-center">Loading...</div>}
    </div>
  );
}

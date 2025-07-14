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
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Query Cache Test</h1>

        {/* Controls */}
        <div className="flex gap-4 items-center mb-6 pb-4 border-b">
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
                className="ml-2 px-3 py-1 border rounded w-20"
              />
            </label>
            <span className="text-xs text-gray-500 mt-1">
              Changing this will spawn a new app
            </span>
          </div>
          <button
            onClick={generateRandomTodo}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            🎲 Spawn Random Todo
          </button>
          <span className="text-sm text-gray-600">
            Current: <strong>{cacheLimit}</strong> queries
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Master View - All Todos */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">All Todos</h2>

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
                    className={`p-3 border rounded cursor-pointer transition-colors ${
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
                          className="w-4 h-4"
                        />
                        <span
                          className={
                            todo.completed ? 'line-through text-gray-500' : ''
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
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {(!allTodos?.todos || allTodos.todos.length === 0) && (
                  <div className="text-gray-500 text-center py-8">
                    No todos yet. Click "🎲 Spawn Random Todo" to create some!
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detail View - Selected Todo */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Todo Detail</h2>

            {!selectedTodoId ? (
              <div className="text-gray-500 text-center py-8">
                Select a todo from the list to view details
              </div>
            ) : detailLoading ? (
              <div className="text-gray-500">Loading todo details...</div>
            ) : todoDetail?.todos?.[0] ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID
                  </label>
                  <div className="text-sm text-gray-600 font-mono bg-gray-50 p-2 rounded">
                    {todoDetail.todos[0].id}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Text
                  </label>
                  <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {todoDetail.todos[0].text}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
                    {todoDetail.todos[0].completed ? 'Completed' : 'Pending'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Created At
                  </label>
                  <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    {todoDetail.todos[0].createdAt
                      ? new Date(todoDetail.todos[0].createdAt).toLocaleString()
                      : 'Unknown'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-red-500 text-center py-8">
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
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Query Cache Test</h1>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">About Query Caching</h2>
          <div className="text-sm text-gray-700 space-y-2 mb-4">
            <p>
              • Until we have single-store, we limit the number of queries we
              cache for offline use
            </p>
            <p>• This tool helps verify the caching behavior works correctly</p>
            <p>
              • By default we cache 10 queries, but you can configure this by
              passing{' '}
              <code className="bg-gray-100 px-1 rounded">queryCacheLimit</code>{' '}
              to <code className="bg-gray-100 px-1 rounded">init()</code>
            </p>
          </div>

          <h3 className="font-medium mb-2">How to Test</h3>
          <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
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

        <p className="text-sm text-gray-500 mb-2">
          Cache limit: <strong>{cacheLimit}</strong> queries
        </p>
        {isHydrated && (
          <ResetButton className="bg-gray-600 text-white px-4 py-2 rounded" />
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
      {!isHydrated && <div className="text-center py-8">Loading...</div>}
    </div>
  );
}

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

interface WALEvent {
  id: number;
  message: string;
}

const NEW_TODO_TITLES = [
  'Deploy to prod',
  'Review PR',
  'Update deps',
  'Add tests',
  'Clean up logs',
];

const INITIAL_TODOS: Todo[] = [
  { id: 'todo_1', title: 'Ship delight', done: true },
  { id: 'todo_2', title: 'Fix bug', done: false },
];

export function WALInvalidationDemo() {
  const [todos, setTodos] = useState<Todo[]>(INITIAL_TODOS);
  const [walEvents, setWalEvents] = useState<WALEvent[]>([]);
  const [invalidated, setInvalidated] = useState<Set<string>>(new Set());
  const walCounter = useRef(0);
  const newTodoIdx = useRef(0);

  const addWalEvent = (message: string) => {
    const id = walCounter.current++;
    setWalEvents((prev) => [...prev, { id, message }]);
  };

  const flashInvalidation = (queryIds: string[]) => {
    setInvalidated(new Set(queryIds));
    setTimeout(() => setInvalidated(new Set()), 400);
  };

  const toggleTodo = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    // Update immediately (optimistic)
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );

    addWalEvent(`${todo.title} marked ${!todo.done ? 'done' : 'not done'}`);

    flashInvalidation(['q2']);
  };

  const addTodo = () => {
    const title = NEW_TODO_TITLES[newTodoIdx.current % NEW_TODO_TITLES.length];
    const id = `todo_${todos.length + 1}`;
    newTodoIdx.current++;

    // Update immediately (optimistic)
    setTodos((prev) => [...prev, { id, title, done: false }]);

    addWalEvent(`${title} created`);

    flashInvalidation(['q1']);
  };

  const deleteTodo = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    setTodos((prev) => prev.filter((t) => t.id !== id));

    addWalEvent(`${todo?.title ?? id} deleted`);

    const affected = ['q1'];
    if (todo?.done) affected.push('q2');
    flashInvalidation(affected);
  };

  const completedTodos = todos.filter((t) => t.done);

  return (
    <div className="flex flex-col gap-4">
      {/* Top row: todo app + WAL stream */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        {/* Mini todo app */}
        <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-4 py-2">
            <span className="text-xs font-medium text-gray-400">My Todos</span>
            <button
              onClick={addTodo}
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-500 transition-colors hover:border-orange-300 hover:text-orange-600"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Add
            </button>
          </div>
          <div className="h-[140px] overflow-y-auto">
            <AnimatePresence initial={false}>
              {todos.map((todo) => (
                <motion.div
                  key={todo.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex items-center gap-3 border-b border-gray-50 px-4 py-2.5"
                >
                  <button
                    onClick={() => toggleTodo(todo.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                      todo.done
                        ? 'border-orange-500 bg-orange-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {todo.done && (
                      <svg
                        className="h-3 w-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={3}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                    )}
                  </button>
                  <span
                    className={`flex-1 text-sm ${
                      todo.done ? 'text-gray-400 line-through' : 'text-gray-700'
                    }`}
                  >
                    {todo.title}
                  </span>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="shrink-0 text-gray-300 transition-colors hover:text-gray-500"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* WAL stream */}
        <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:w-[200px] sm:shrink-0">
          <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-2 text-[10px] font-medium tracking-wider text-gray-400 uppercase">
            WAL Stream
          </div>
          <div className="flex h-[140px] flex-col-reverse overflow-y-auto px-3 py-1.5">
            <div>
              {walEvents.map((evt) => (
                <div key={evt.id} className="py-0.5 text-[11px] text-gray-500">
                  {evt.message}
                </div>
              ))}
            </div>
            {walEvents.length === 0 && (
              <div className="flex h-full items-center justify-center text-[10px] text-gray-300">
                Toggle or add a todo to see events
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Queries */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        {/* All todos */}
        <QueryCard
          label="All todos"
          instaql={
            <>
              <span style={{ color: c.punctuation }}>{'{ '}</span>
              <span style={{ color: c.text }}>todos</span>
              <span style={{ color: c.punctuation }}>{': {} }'}</span>
            </>
          }
          topic="[:ea _ :todos/id _]"
          results={todos.map((t) => t.title)}
          isInvalidated={invalidated.has('q1')}
        />

        {/* Completed todos */}
        <QueryCard
          label="Completed todos"
          instaql={
            <>
              <span style={{ color: c.punctuation }}>{'{ '}</span>
              <span style={{ color: c.text }}>todos</span>
              <span style={{ color: c.punctuation }}>
                {': { $: { where: { '}
              </span>
              <span style={{ color: c.parameter }}>done</span>
              <span style={{ color: c.punctuation }}>{': '}</span>
              <span style={{ color: c.value }}>true</span>
              <span style={{ color: c.punctuation }}>{' } } } }'}</span>
            </>
          }
          topic="[:av _ :todos/done true]"
          results={completedTodos.map((t) => t.title)}
          isInvalidated={invalidated.has('q2')}
        />
      </div>
    </div>
  );
}

function QueryCard({
  label,
  instaql,
  topic,
  results,
  isInvalidated,
}: {
  label: string;
  instaql: React.ReactNode;
  topic: string;
  results: string[];
  isInvalidated: boolean;
}) {
  return (
    <motion.div
      className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
      animate={{
        borderColor: isInvalidated ? '#f97316' : '#e5e7eb',
      }}
      transition={{ duration: 0.3 }}
    >
      <div className="border-b border-gray-100 bg-gray-50/60 px-3 py-2">
        <div className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
          {label}
        </div>
        <div className="mt-1 font-mono text-[11px]">{instaql}</div>
      </div>

      <div className="border-b border-gray-50 px-3 py-2">
        <div className="text-[9px] font-medium tracking-wider text-gray-300 uppercase">
          Topic
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-gray-400">
          {topic}
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="relative flex items-center">
          <div className="text-[9px] font-medium tracking-wider text-gray-300 uppercase">
            Results
          </div>
          <AnimatePresence>
            {isInvalidated && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute left-[46px] rounded-full bg-orange-100 px-1.5 py-0.5 text-[8px] font-medium text-orange-600"
              >
                refreshing
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-1 h-[60px] space-y-0.5 overflow-y-auto">
          {results.map((r) => (
            <div key={r} className="font-mono text-[11px] text-gray-600">
              {r}
            </div>
          ))}
          {results.length === 0 && (
            <div className="text-[11px] text-gray-300 italic">No results</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

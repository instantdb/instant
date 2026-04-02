/**
 * Offline mode demo.
 *
 * Three panels in a row: App (mini todo), Cache (persisted query results),
 * Outbox (queued mutations). Network toggle above.
 */

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

interface OutboxEntry {
  id: number;
  label: string;
}

const INITIAL_TODOS: Todo[] = [
  { id: 'todo_1', title: 'Ship delight', done: false },
  { id: 'todo_2', title: 'Fix bug', done: true },
];

const NEW_TITLES = ['Deploy to prod', 'Review PR', 'Add tests', 'Write docs'];

export function OfflineDemo() {
  const [online, setOnline] = useState(true);
  const [todos, setTodos] = useState<Todo[]>(INITIAL_TODOS);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const counter = useRef(0);
  const newIdx = useRef(0);

  const addMutation = (label: string) => {
    const id = counter.current++;
    if (!online) {
      setOutbox((prev) => [...prev, { id, label }]);
    }
  };

  const toggleTodo = (todoId: string) => {
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return;
    setTodos((prev) =>
      prev.map((t) => (t.id === todoId ? { ...t, done: !t.done } : t)),
    );
    addMutation(`${todo.title} marked ${!todo.done ? 'done' : 'not done'}`);
  };

  const addTodo = () => {
    const title = NEW_TITLES[newIdx.current % NEW_TITLES.length];
    newIdx.current++;
    setTodos((prev) => [
      { id: `todo_${Date.now()}`, title, done: false },
      ...prev,
    ]);
    addMutation(`${title} created`);
  };

  const deleteTodo = (todoId: string) => {
    const todo = todos.find((t) => t.id === todoId);
    setTodos((prev) => prev.filter((t) => t.id !== todoId));
    addMutation(`${todo?.title ?? todoId} deleted`);
  };

  const goOnline = () => {
    setOnline(true);
    outbox.forEach((_, i) => {
      setTimeout(
        () => {
          setOutbox((prev) => prev.slice(1));
        },
        (i + 1) * 150,
      );
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Network toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full transition-colors ${
              online ? 'bg-green-400' : 'bg-gray-300'
            }`}
          />
          <span className="text-[11px] font-medium text-gray-500">
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
        <button
          onClick={online ? () => setOnline(false) : goOnline}
          className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
            online
              ? 'border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500'
              : 'border-green-300 text-green-600 hover:bg-green-50'
          }`}
        >
          {online ? 'Go offline' : 'Go online'}
        </button>
      </div>

      {/* Three panels side by side */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* App */}
        <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-3 py-1.5">
            <span className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
              App
            </span>
            <button
              onClick={addTodo}
              className="flex items-center gap-1 text-[10px] text-gray-400 transition-colors hover:text-orange-600"
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
          <div className="h-[130px] overflow-y-auto">
            <AnimatePresence initial={false}>
              {todos.map((todo) => (
                <motion.div
                  key={todo.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5"
                >
                  <button
                    onClick={() => toggleTodo(todo.id)}
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors ${
                      todo.done
                        ? 'border-orange-500 bg-orange-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {todo.done && (
                      <svg
                        className="h-2 w-2 text-white"
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
                    className={`flex-1 text-[11px] ${
                      todo.done ? 'text-gray-400 line-through' : 'text-gray-700'
                    }`}
                  >
                    {todo.title}
                  </span>
                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="shrink-0 cursor-pointer text-gray-300 transition-colors hover:text-gray-500"
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
                        d="M6 18 18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Cache */}
        <div
          className={`flex-1 overflow-hidden rounded-xl border bg-white shadow-sm transition-colors ${
            online ? 'border-green-300' : 'border-orange-300'
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-3 py-1.5">
            <span className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
              Cache
            </span>
            <span
              className={`text-[9px] font-medium ${
                online ? 'text-green-500' : 'text-orange-500'
              }`}
            >
              {online ? 'In sync' : 'Optimistic'}
            </span>
          </div>
          <div className="h-[130px] overflow-y-auto px-3 py-1.5">
            {todos.map((todo) => (
              <div
                key={todo.id}
                className="flex items-center justify-between py-0.5"
              >
                <span className="font-mono text-[10px] text-gray-600">
                  {todo.title}
                </span>
                <span
                  className={`text-[9px] ${
                    todo.done ? 'text-green-500' : 'text-gray-300'
                  }`}
                >
                  {todo.done ? 'done' : 'pending'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Outbox */}
        <div
          className={`flex-1 overflow-hidden rounded-xl border bg-white shadow-sm transition-colors ${
            outbox.length > 0 ? 'border-orange-300' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/80 px-3 py-1.5">
            <span className="text-[10px] font-medium tracking-wider text-gray-400 uppercase">
              Outbox
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${outbox.length > 0 ? 'bg-orange-100 text-orange-600' : 'invisible'}`}
            >
              {outbox.length || 0}
            </span>
          </div>
          <div className="h-[130px] overflow-y-auto px-3 py-1.5">
            <AnimatePresence initial={false}>
              {outbox.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.15 }}
                  className="py-0.5 text-[10px] text-orange-600"
                >
                  {entry.label}
                </motion.div>
              ))}
            </AnimatePresence>
            {outbox.length === 0 && (
              <div className="flex h-full items-center justify-center text-[10px] text-gray-300">
                {online ? 'Empty' : 'Mutations queue here'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

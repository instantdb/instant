'use client';

import { useRef, useState } from 'react';
import { i, id, init, InstantReactWebDatabase } from '@instantdb/react';
import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';

const schema = i.schema({
  entities: {
    todos: i.entity({
      text: i.string(),
      done: i.boolean(),
      createdAt: i.number().indexed(),
    }),
  },
});

let db: InstantReactWebDatabase<typeof schema> = null as any;

function CheckIcon() {
  return (
    <svg
      className="h-3 w-3 text-white"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg
      className="mb-3 h-12 w-12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
    </svg>
  );
}

function TodoApp() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = db.useQuery({
    todos: { $: { order: { createdAt: 'asc' } } },
  });

  const todos = data?.todos ?? [];

  const addTodo = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    db.transact(
      db.tx.todos[id()].update({
        text: trimmed,
        done: false,
        createdAt: Date.now(),
      }),
    );
    setText('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex-1 overflow-y-auto px-5">
        {!isLoading && todos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300">
            <ClipboardIcon />
            <span className="text-base">No todos yet</span>
          </div>
        ) : (
          todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center gap-3 border-b border-gray-50 py-3"
            >
              <button
                onClick={() =>
                  db.transact(
                    db.tx.todos[todo.id].update({ done: !todo.done }),
                  )
                }
                className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  todo.done
                    ? 'border-orange-500 bg-orange-500'
                    : 'border-orange-300 hover:border-orange-400'
                }`}
              >
                {todo.done && <CheckIcon />}
              </button>
              <span
                className={`text-base ${
                  todo.done
                    ? 'text-gray-400 line-through'
                    : 'text-gray-700'
                }`}
              >
                {todo.text}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-100 px-5 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTodo();
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to be done?"
            className="flex-1 rounded-lg bg-gray-50 px-3 py-2.5 text-base text-gray-700 placeholder-gray-300 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const router = useReadyRouter();
  const appId = router.query.a as string;
  const isLocal = router.query.localBackend === '1';

  if (!appId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">
        You loaded this screen without an appId.
      </div>
    );
  }

  if (!db) {
    db = init({
      appId,
      schema,
      ...(isLocal
        ? {
            apiURI: 'http://localhost:8888',
            websocketURI: 'ws://localhost:8888/runtime/session',
          }
        : {}),
    });
  }

  return <TodoApp />;
}

export default asClientOnlyPage(App);

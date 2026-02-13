import { id, type InstaQLEntity } from "@instantdb/solidjs";
import { createSignal, For, Show, type Component } from "solid-js";
import { db } from "./lib/db";
import type { AppSchema } from "./instant.schema";

type Todo = InstaQLEntity<AppSchema, "todos">;

const App: Component = () => {
  const state = db.useQuery({ todos: {} });
  const todos = () => state().data?.todos ?? [];

  return (
    <Show when={!state().isLoading}>
      <Show
        when={!state().error}
        fallback={
          <div class="text-red-500 p-4">Error: {state().error?.message}</div>
        }
      >
        <div class="p-8 grid-cols-2 items-start gap-2 grid">
          <Welcome />
          <div class="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col">
            <h2 class="tracking-wide text-[#F54A00] text-2xl">Todos</h2>
            <div class="text-xs pb-4">
              Open another tab to see todos update in realtime!
            </div>
            <div class="border rounded border-neutral-300">
              <TodoForm />
              <TodoList todos={todos()} />
              <ActionBar todos={todos()} />
            </div>
          </div>
        </div>
      </Show>
    </Show>
  );
};

function addTodo(text: string) {
  db.transact(
    db.tx.todos[id()].update({
      text,
      done: false,
      createdAt: Date.now(),
    }),
  );
}

function deleteTodo(todo: Todo) {
  db.transact(db.tx.todos[todo.id].delete());
}

function toggleDone(todo: Todo) {
  db.transact(db.tx.todos[todo.id].update({ done: !todo.done }));
}

function deleteCompleted(todos: Todo[]) {
  const completed = todos.filter((todo) => todo.done);
  if (completed.length === 0) return;
  const txs = completed.map((todo) => db.tx.todos[todo.id].delete());
  db.transact(txs);
}

function TodoForm() {
  const [text, setText] = createSignal("");
  return (
    <div class="flex items-center h-10 border-neutral-300">
      <form
        class="flex-1 h-full"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text()) return;
          addTodo(text());
          setText("");
        }}
      >
        <input
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
          class="w-full h-full placeholder-neutral-300 px-2 outline-none bg-transparent"
          autofocus
          placeholder="What needs to be done?"
          type="text"
          name="input"
        />
      </form>
    </div>
  );
}

function TodoList(props: { todos: Todo[] }) {
  return (
    <div class="divide-y divide-neutral-300">
      <For each={props.todos}>
        {(todo) => (
          <div class="flex items-center h-10">
            <div class="h-full px-2 flex items-center justify-center">
              <div class="w-5 h-5 flex items-center justify-center">
                <input
                  type="checkbox"
                  class="cursor-pointer"
                  checked={todo.done}
                  onChange={() => toggleDone(todo)}
                />
              </div>
            </div>
            <div class="flex-1 px-2 overflow-hidden flex items-center">
              <span classList={{ "line-through": todo.done }}>{todo.text}</span>
            </div>
            <button
              class="h-full px-2 flex items-center justify-center text-neutral-300 hover:text-neutral-500"
              onClick={() => deleteTodo(todo)}
            >
              X
            </button>
          </div>
        )}
      </For>
    </div>
  );
}

function ActionBar(props: { todos: Todo[] }) {
  return (
    <div class="flex justify-between items-center h-10 px-2 text-xs border-t border-neutral-300">
      <div>
        Remaining todos: {props.todos.filter((todo) => !todo.done).length}
      </div>
      <button
        class=" text-neutral-300 hover:text-neutral-500"
        onClick={() => deleteCompleted(props.todos)}
      >
        Delete Completed
      </button>
    </div>
  );
}

function Welcome() {
  return (
    <div class="bg-white p-6 rounded-lg border border-neutral-200 shadow flex justify-center flex-col gap-2">
      <h2 class="tracking-wide text-[#F54A00] text-2xl text-center">
        Solid + Vite + Instant DB
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 grow gap-2">
        <a
          href="https://docs.solidjs.com/"
          target="_blank"
          rel="noopener noreferrer"
          class="border hover:bg-neutral-100 py-8 shadow flex flex-col gap-2 items-center justify-center font-semibold border-neutral-200 rounded"
        >
          <img
            src="https://www.solidjs.com/img/logo/without-wordmark/logo.svg"
            width={34}
          />
          Solid Docs
        </a>
        <a
          target="_blank"
          href="https://www.instantdb.com/docs"
          rel="noopener noreferrer"
          class="border shadow flex flex-col py-8 gap-2 hover:bg-neutral-100 items-center justify-center font-semibold border-neutral-200 rounded"
        >
          <img
            src="https://www.instantdb.com/img/icon/logo-512.svg"
            width={34}
          />
          Instant Docs
        </a>
      </div>
    </div>
  );
}

export default App;

import { AppSchema } from "@/instant.schema";
import { db } from "@/lib/db";
import { id, InstaQLEntity } from "@instantdb/react";
import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/")({ component: App });

type Todo = InstaQLEntity<AppSchema, "todos">;

function App() {
  // Read Data
  const { isLoading, error, data } = db.useQuery({ todos: {} });

  if (isLoading) {
    return null;
  }
  if (error) {
    return <div className="text-red-500 p-4">Error: {error.message}</div>;
  }

  const { todos } = data;
  return (
    <div className="p-8 grid-cols-2 items-start gap-2 grid">
      <Welcome />
      <div className="bg-white rounded-lg p-6 border border-neutral-200 shadow flex flex-col">
        <h2 className="tracking-wide text-[#F54A00] text-2xl">Todos</h2>
        <div className="text-xs pb-4">
          Open another tab to see todos update in realtime!
        </div>
        <div className="border rounded border-neutral-300">
          <TodoForm />
          <TodoList todos={todos} />
          <ActionBar todos={todos} />
        </div>
      </div>
    </div>
  );
}

// Write Data
// ---------
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
  return (
    <div className="flex items-center h-10 border-neutral-300">
      <form
        className="flex-1 h-full"
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.input as HTMLInputElement;
          addTodo(input.value);
          input.value = "";
        }}
      >
        <input
          className="w-full h-full px-2 outline-none bg-transparent"
          autoFocus
          placeholder="What needs to be done?"
          type="text"
          name="input"
        />
      </form>
    </div>
  );
}

function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <div className="divide-y divide-neutral-300">
      {todos.map((todo) => (
        <div key={todo.id} className="flex items-center h-10">
          <div className="h-full px-2 flex items-center justify-center">
            <div className="w-5 h-5 flex items-center justify-center">
              <input
                type="checkbox"
                className="cursor-pointer"
                checked={todo.done}
                onChange={() => toggleDone(todo)}
              />
            </div>
          </div>
          <div className="flex-1 px-2 overflow-hidden flex items-center">
            {todo.done ? (
              <span className="line-through">{todo.text}</span>
            ) : (
              <span>{todo.text}</span>
            )}
          </div>
          <button
            className="h-full px-2 flex items-center justify-center text-neutral-300 hover:text-neutral-500"
            onClick={() => deleteTodo(todo)}
          >
            X
          </button>
        </div>
      ))}
    </div>
  );
}

function ActionBar({ todos }: { todos: Todo[] }) {
  return (
    <div className="flex justify-between items-center h-10 px-2 text-xs border-t border-neutral-300">
      <div>Remaining todos: {todos.filter((todo) => !todo.done).length}</div>
      <button
        className=" text-neutral-300 hover:text-neutral-500"
        onClick={() => deleteCompleted(todos)}
      >
        Delete Completed
      </button>
    </div>
  );
}

export function Welcome() {
  return (
    <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow flex  justify-center flex-col gap-2">
      <h2 className="tracking-wide text-[#F54A00] text-2xl text-center">
        Tanstack Start + Instant DB
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 grow gap-2">
        <a
          href="https://tanstack.com/start/latest/docs/framework/react/overview"
          target="_blank"
          rel="noopener noreferrer"
          className="border hover:bg-neutral-100 py-8 shadow flex flex-col gap-2 items-center justify-center font-semibold border-neutral-200 rounded"
        >
          <img
            src="https://tanstack.com/images/logos/logo-color-600.png"
            width={34}
          ></img>
          Tanstack Start Docs
        </a>
        <a
          target="_blank"
          href="https://www.instantdb.com/docs"
          rel="noopener noreferrer"
          className="border shadow flex flex-col py-8 gap-2 hover:bg-neutral-100 items-center justify-center font-semibold border-neutral-200 rounded"
        >
          <img
            src="https://www.instantdb.com/img/icon/logo-512.svg"
            width={34}
          ></img>
          Instant Docs
        </a>
      </div>
    </div>
  );
}

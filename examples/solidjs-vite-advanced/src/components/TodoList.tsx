import { type Component, createSignal, For, Show } from "solid-js";
import { db, id, tx } from "../lib/db";

const TodoList: Component = () => {
  const state = db.useQuery({ todos: {} });
  const [newText, setNewText] = createSignal("");
  const [snapshot, setSnapshot] = createSignal<string>("");

  const handleAdd = (e: Event) => {
    e.preventDefault();
    const text = newText().trim();
    if (!text) return;
    db.transact(
      tx.todos[id()].update({
        text,
        done: false,
        createdAt: Date.now(),
      }),
    );
    setNewText("");
  };

  const handleToggle = (todoId: string, currentDone: boolean) => {
    db.transact(tx.todos[todoId].update({ done: !currentDone }));
  };

  const handleDelete = (todoId: string) => {
    db.transact(tx.todos[todoId].delete());
  };

  const handleQueryOnce = async () => {
    const result = await db.queryOnce({ todos: {} });
    setSnapshot(
      JSON.stringify(result.data.todos?.length ?? 0) +
        " todos at " +
        new Date().toLocaleTimeString(),
    );
  };

  const todos = () => {
    const data = state().data;
    if (!data) return [];
    return [...data.todos].sort((a, b) => a.createdAt - b.createdAt);
  };

  return (
    <div class="bg-white rounded-lg shadow p-4 space-y-3">
      <h2 class="font-bold text-lg">Todos</h2>

      <Show when={state().error}>
        <p class="text-red-500 text-sm">{state().error?.message}</p>
      </Show>

      <form onSubmit={handleAdd} class="flex gap-2">
        <input
          type="text"
          placeholder="Add a todo..."
          value={newText()}
          onInput={(e) => setNewText(e.currentTarget.value)}
          class="flex-1 border rounded px-2 py-1 text-sm"
        />
        <button
          type="submit"
          class="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        >
          Add
        </button>
      </form>

      <Show
        when={!state().isLoading}
        fallback={<p class="text-gray-400 text-sm">Loading todos...</p>}
      >
        <ul class="space-y-1">
          <For
            each={todos()}
            fallback={<li class="text-gray-400 text-sm">No todos yet</li>}
          >
            {(todo) => (
              <li class="flex items-center gap-2 group">
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => handleToggle(todo.id, todo.done)}
                  class="rounded"
                />
                <span
                  class={`flex-1 text-sm ${todo.done ? "line-through text-gray-400" : ""}`}
                >
                  {todo.text}
                </span>
                <button
                  class="text-red-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(todo.id)}
                >
                  delete
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <div class="border-t pt-2 mt-2">
        <button
          class="px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs transition-colors"
          onClick={handleQueryOnce}
        >
          queryOnce() snapshot
        </button>
        {snapshot() && (
          <span class="text-gray-400 text-xs ml-2">{snapshot()}</span>
        )}
      </div>
    </div>
  );
};

export default TodoList;

/**
 * Todos App — exact reproduction of https://www.instantdb.com/examples/todos
 * using the REAL @instantdb/react package against the Go backend.
 */
import { db, id, tx } from './db';

interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

// Write operations — identical to the official example
function addTodo(text: string) {
  db.transact(
    tx.todos[id()].update({
      text,
      done: false,
      createdAt: Date.now(),
    }),
  );
}

function deleteTodo(todo: Todo) {
  db.transact(tx.todos[todo.id].delete());
}

function toggleDone(todo: Todo) {
  db.transact(tx.todos[todo.id].update({ done: !todo.done }));
}

function deleteCompleted(todos: Todo[]) {
  const completed = todos.filter((todo) => todo.done);
  const txs = completed.map((todo) => tx.todos[todo.id].delete());
  db.transact(txs);
}

function toggleAll(todos: Todo[]) {
  const newVal = !todos.every((todo) => todo.done);
  db.transact(
    todos.map((todo) => tx.todos[todo.id].update({ done: newVal })),
  );
}

// Components — identical to the official example
function TodoForm({ todos }: { todos: Todo[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: 40, borderBottom: '1px solid #ccc' }}>
      <button
        data-testid="toggle-all"
        onClick={() => toggleAll(todos)}
        style={{ height: '100%', padding: '0 8px', background: 'none', border: 'none', borderRight: '1px solid #ccc', cursor: 'pointer' }}
      >
        ▼
      </button>
      <form
        data-testid="todo-form"
        style={{ flex: 1, height: '100%' }}
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements as any).input as HTMLInputElement;
          if (input.value.trim()) {
            addTodo(input.value.trim());
            input.value = '';
          }
        }}
      >
        <input
          name="input"
          data-testid="todo-input"
          placeholder="What needs to be done?"
          style={{ width: '100%', height: '100%', padding: '0 8px', border: 'none', outline: 'none', fontFamily: 'inherit' }}
          autoFocus
        />
      </form>
    </div>
  );
}

function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <div data-testid="todo-list">
      {todos.map((todo) => (
        <div key={todo.id} data-testid="todo-item" style={{ display: 'flex', alignItems: 'center', height: 40, borderBottom: '1px solid #eee' }}>
          <div style={{ padding: '0 8px' }}>
            <input
              type="checkbox"
              data-testid="todo-checkbox"
              checked={todo.done}
              onChange={() => toggleDone(todo)}
            />
          </div>
          <div data-testid="todo-text" style={{ flex: 1, textDecoration: todo.done ? 'line-through' : 'none' }}>
            {todo.text}
          </div>
          <button
            data-testid="todo-delete"
            onClick={() => deleteTodo(todo)}
            style={{ padding: '0 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#ccc' }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function ActionBar({ todos }: { todos: Todo[] }) {
  const remaining = todos.filter((t) => !t.done).length;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 40, padding: '0 8px', borderTop: '1px solid #ccc', fontSize: 12 }}>
      <span data-testid="remaining-count">Remaining todos: {remaining}</span>
      <button
        data-testid="delete-completed"
        onClick={() => deleteCompleted(todos)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 12 }}
      >
        Delete Completed
      </button>
    </div>
  );
}

export default function App() {
  // This is the REAL @instantdb/react useQuery hook
  const { isLoading, error, data } = db.useQuery({ todos: {} });

  if (isLoading) return <div data-testid="loading">Loading...</div>;
  if (error) return <div data-testid="error">Error: {error.message}</div>;

  const todos: Todo[] = (data?.todos || []) as Todo[];

  return (
    <div style={{ fontFamily: 'ui-monospace, monospace', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 16 }}>
      <h2 data-testid="title" style={{ fontSize: 48, color: '#ccc', letterSpacing: 4 }}>todos</h2>
      <div data-testid="app-container" style={{ border: '1px solid #ccc', maxWidth: 320, width: '100%' }}>
        <TodoForm todos={todos} />
        <TodoList todos={todos} />
        <ActionBar todos={todos} />
      </div>
    </div>
  );
}

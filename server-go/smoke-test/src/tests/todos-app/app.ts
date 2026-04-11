/**
 * Todos Example App — headless logic layer.
 *
 * This is the exact same business logic as the React component at
 * https://www.instantdb.com/examples/todos but extracted from JSX
 * so it can be tested headlessly against the Go server.
 *
 * In the real app, `useQuery` returns reactive data and the UI re-renders.
 * Here we use the admin REST API (same underlying queries/transactions)
 * to simulate the same operations.
 */

import { post, adminHeaders, TestApp, uuid } from '../../helpers.js';
import type { Todo } from './schema.js';

/** The todos app backed by our Go server. */
export class TodosApp {
  private app: TestApp;
  private headers: Record<string, string>;

  constructor(app: TestApp) {
    this.app = app;
    this.headers = adminHeaders(app);
  }

  // ---- Reads (simulates useQuery) ----

  /** Fetch all todos. Equivalent to: db.useQuery({ todos: {} }) */
  async fetchTodos(): Promise<Todo[]> {
    const data = await post('/admin/query', {
      query: { todos: {} },
    }, this.headers);
    return (data.todos || []) as Todo[];
  }

  /** Fetch todos with filter. Equivalent to: db.useQuery({ todos: { $: { where: ... } } }) */
  async fetchTodosWhere(where: Record<string, any>): Promise<Todo[]> {
    const data = await post('/admin/query', {
      query: { todos: { $: { where } } },
    }, this.headers);
    return (data.todos || []) as Todo[];
  }

  /** Fetch remaining (not done) todos count. */
  async remainingCount(): Promise<number> {
    const todos = await this.fetchTodos();
    return todos.filter((t) => !t.done).length;
  }

  // ---- Writes (simulates db.transact) ----

  /** Add a todo. Equivalent to:
   *    db.transact(db.tx.todos[id()].update({ text, done: false, createdAt: Date.now() }))
   */
  async addTodo(text: string): Promise<string> {
    const todoId = uuid();
    const idAttr = this.app.attrs['todos.id'];
    const textAttr = this.app.attrs['todos.text'];
    const doneAttr = this.app.attrs['todos.done'];
    const createdAtAttr = this.app.attrs['todos.createdAt'];

    await post('/admin/transact', {
      steps: [
        ['add-triple', todoId, idAttr.id, todoId],
        ['add-triple', todoId, textAttr.id, text],
        ['add-triple', todoId, doneAttr.id, false],
        ['add-triple', todoId, createdAtAttr.id, Date.now()],
      ],
    }, this.headers);

    return todoId;
  }

  /** Toggle done status. Equivalent to:
   *    db.transact(db.tx.todos[todo.id].update({ done: !todo.done }))
   */
  async toggleDone(todo: Todo): Promise<void> {
    const doneAttr = this.app.attrs['todos.done'];
    await post('/admin/transact', {
      steps: [
        ['add-triple', todo.id, doneAttr.id, !todo.done],
      ],
    }, this.headers);
  }

  /** Delete a todo. Equivalent to:
   *    db.transact(db.tx.todos[todo.id].delete())
   */
  async deleteTodo(todoId: string): Promise<void> {
    await post('/admin/transact', {
      steps: [['delete-entity', todoId, 'todos']],
    }, this.headers);
  }

  /** Delete all completed todos. Equivalent to:
   *    const txs = completed.map((todo) => db.tx.todos[todo.id].delete());
   *    db.transact(txs);
   */
  async deleteCompleted(): Promise<number> {
    const todos = await this.fetchTodos();
    const completed = todos.filter((t) => t.done);
    if (completed.length === 0) return 0;

    const steps = completed.map((t) => ['delete-entity', t.id, 'todos'] as any);
    await post('/admin/transact', { steps }, this.headers);
    return completed.length;
  }

  /** Toggle all todos done/undone. Equivalent to:
   *    const newVal = !todos.every((todo) => todo.done);
   *    db.transact(todos.map((todo) => db.tx.todos[todo.id].update({ done: newVal })));
   */
  async toggleAll(): Promise<boolean> {
    const todos = await this.fetchTodos();
    const newVal = !todos.every((t) => t.done);
    const doneAttr = this.app.attrs['todos.done'];

    const steps = todos.map((t) =>
      ['add-triple', t.id, doneAttr.id, newVal] as any,
    );
    await post('/admin/transact', { steps }, this.headers);
    return newVal;
  }
}

import { id, type InstaQLEntity } from "@instantdb/core";
import type { AppSchema } from "./instant.schema";
import { db } from "./lib/db";

type Todo = InstaQLEntity<AppSchema, "todos", {}, undefined, true>;

// Subscribe to data
// ---------
db.subscribeQuery({ todos: {} }, (resp) => {
  if (resp.error) {
    renderError(resp.error.message); // Pro-tip: Check you have the right appId!
    return;
  }
  if (resp.data) {
    render(resp.data);
  }
});

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
  focusInput();
}

function deleteTodoItem(todo: Todo) {
  db.transact(db.tx.todos[todo.id].delete());
}

function toggleDone(todo: Todo) {
  db.transact(db.tx.todos[todo.id].update({ done: !todo.done }));
}

function deleteCompleted(todos: Todo[]) {
  const completed = todos.filter((todo) => todo.done);
  const txs = completed.map((todo) => db.tx.todos[todo.id].delete());
  db.transact(txs);
}

function toggleAllTodos(todos: Todo[]) {
  const newVal = !todos.every((todo) => todo.done);
  db.transact(
    todos.map((todo) => db.tx.todos[todo.id].update({ done: newVal })),
  );
}

// Styles
// ---------
const styles: Record<string, string> = {
  container: `
    box-sizing: border-box;
    background-color: #fafafa;
    font-family: code, monospace;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
  `,
  header: `
    letter-spacing: 2px;
    font-size: 50px;
    color: lightgray;
    margin-bottom: 10px;
  `,
  form: `
    box-sizing: inherit;
    display: flex;
    border: 1px solid lightgray;
    border-bottom-width: 0px;
    width: 350px;
  `,
  toggleAll: `
    font-size: 30px;
    cursor: pointer;
    margin-left: 11px;
    margin-top: -6px;
    width: 15px;
    margin-right: 12px;
  `,
  input: `
    background-color: transparent;
    font-family: code, monospace;
    width: 287px;
    padding: 10px;
    font-style: italic;
  `,
  todoList: `
    box-sizing: inherit;
    width: 350px;
  `,
  checkbox: `
    font-size: 30px;
    margin-left: 5px;
    margin-right: 20px;
    cursor: pointer;
  `,
  todo: `
    display: flex;
    align-items: center;
    padding: 10px;
    border: 1px solid lightgray;
    border-bottom-width: 0px;
  `,
  todoText: `
    flex-grow: 1;
    overflow: hidden;
  `,
  delete: `
    width: 25px;
    cursor: pointer;
    color: lightgray;
  `,
  actionBar: `
    display: flex;
    justify-content: space-between;
    width: 328px;
    padding: 10px;
    border: 1px solid lightgray;
    font-size: 10px;
  `,
  footer: `
    margin-top: 20px;
    font-size: 10px;
  `,
};

// Render
// ---------
const app = document.getElementById("app")!;
app.style.cssText = styles.container;

function render(data: { todos: Todo[] }) {
  app.innerHTML = "";

  const { todos } = data;

  const containerHTML = `
    <div style="${styles.container}">
      <div style="${styles.header}">todos</div>
      ${TodoForm()}
      ${TodoList(todos)}
      ${ActionBar(todos)}
      <div style="${
        styles.footer
      }">Open another tab to see todos update in realtime!</div>
    </div>
  `;

  app.innerHTML = containerHTML;

  // Attach event listeners
  document
    .querySelector(".toggle-all")
    ?.addEventListener("click", () => toggleAllTodos(todos));
  document.querySelector("form")?.addEventListener("submit", submitForm);
  todos.forEach((todo) => {
    document
      .getElementById(`toggle-${todo.id}`)
      ?.addEventListener("change", () => toggleDone(todo));
    document
      .getElementById(`delete-${todo.id}`)
      ?.addEventListener("click", () => deleteTodoItem(todo));
  });
  document
    .querySelector(".delete-completed")
    ?.addEventListener("click", () => deleteCompleted(todos));
}

function renderError(errorMessage: string) {
  app.innerHTML = `
    <div>${errorMessage}</div>
  `;
}

function TodoForm() {
  return `
    <div style="${styles.form}">
      <div class="toggle-all" style="${styles.toggleAll}">⌄</div>
      <form>
        <input style="${styles.input}" placeholder="What needs to be done?" type="text" autofocus>
      </form>
    </div>
  `;
}

function TodoList(todos: Todo[]) {
  return `
    <div style="${styles.todoList}">
      ${todos
        .map(
          (todo) => `
        <div style="${styles.todo}">
          <input id="toggle-${todo.id}" type="checkbox" style="${
            styles.checkbox
          }" ${todo.done ? "checked" : ""}>
          <div style="${styles.todoText}">
            ${
              todo.done
                ? `<span style="text-decoration: line-through;">${todo.text}</span>`
                : `<span>${todo.text}</span>`
            }
          </div>
          <span id="delete-${todo.id}" style="${styles.delete}">𝘟</span>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function ActionBar(todos: Todo[]) {
  return `
    <div style="${styles.actionBar}">
      <div>Remaining todos: ${todos.filter((todo) => !todo.done).length}</div>
      <div class="delete-completed" style="cursor: pointer;">Delete Completed</div>
    </div>
  `;
}

function focusInput() {
  const input = document.querySelector<HTMLInputElement>('input[type="text"]');
  if (input) {
    input.focus();
  }
}

function submitForm(event: Event) {
  event.preventDefault();
  const input = (event.target as HTMLFormElement).querySelector("input");
  if (input && input.value.trim()) {
    addTodo(input.value);
    input.value = "";
  }
}

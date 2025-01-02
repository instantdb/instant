import "./style.css";
import { init, i, id } from "@instantdb/core";

const APP_ID = import.meta.env.VITE_INSTANT_APP_ID;

const preEl = document.createElement("pre");
document.body.appendChild(preEl);

const buttonEl = document.createElement("button");
buttonEl.innerText = "Add";
buttonEl.onclick = () => {
  console.log(1);
  addTodo(`Todo ${Date.now()}`);
};
document.body.appendChild(buttonEl);

const db = init({
  appId: APP_ID,
  schema: i.schema({
    entities: {
      todos: i.entity({
        title: i.string(),
      }),
    },

  }),
});

db.subscribeQuery(
  {
    todos: {},
  },
  (r) => {
    preEl.innerText = JSON.stringify({ r }, null, "  ");
  },
);

function addTodo(title: string) {
  db.transact(
    db.tx.todos[id()].update({
      title,
    }),
  );
}

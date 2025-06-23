/*
 * TodoMVC Example
 * This example demonstrates a simple todo list application.
 * Also verifies that the UnrelatedComponent does not re-render
 * when the todo list updates.
 * */
import React, { useState } from 'react';
import Head from 'next/head';
import config from '../../config';
import { init, tx, id } from '@instantdb/react';

// Instant app
const { transact, useQuery } = init(config);

function Wrapper() {
  return (
    <div>
      <UnrelatedComponent />
      <TodoApp />
    </div>
  );
}

function UnrelatedComponent() {
  const { isLoading, error, data } = useQuery({ _random: {} });

  if (isLoading) {
    return <div>Fetching data...</div>;
  }
  if (error) {
    return <div>Error fetching data: {error.message}</div>;
  }

  console.log('I should not re-render on todo updates!');
  return <div>Hello</div>;
}

function TodoApp() {
  const [visible, setVisible] = useState('all');

  // Read Data
  const { isLoading, error, data } = useQuery({ todos: {} });
  if (isLoading) {
    return <div>Fetching data...</div>;
  }
  if (error) {
    return <div>Error fetching data: {error.message}</div>;
  }

  const visibleTodos = data.todos.filter((todo) => {
    if (visible === 'all') return true;
    return visible === 'remaining' ? !todo.done : todo.done;
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>todos</div>
      <TodoForm todos={data.todos} />
      <TodoList todos={visibleTodos} />
      <ActionBar todos={data.todos} setVisible={setVisible} />
      <div style={styles.footer}>
        Open another tab to see todos update in realtime!
      </div>
    </div>
  );
}

// Write Data
// ---------
function addTodo(text) {
  transact(
    tx.todos[id()].create({
      text,
      done: false,
      createdAt: new Date(),
    }),
  );
}

function deleteTodo(todo) {
  transact(tx.todos[todo.id].delete());
}

function toggleDone(todo) {
  transact(tx.todos[todo.id].update({ done: !todo.done }, { upsert: false }));
}

function deleteCompleted(todos) {
  const completed = todos.filter((todo) => todo.done);
  const txs = completed.map((todo) => tx.todos[todo.id].delete());
  transact(txs);
}

function toggleAll(todos) {
  const newVal = !todos.every((todo) => todo.done);
  transact(
    todos.map((todo) =>
      tx.todos[todo.id].update({ done: newVal }, { upsert: false }),
    ),
  );
}

// Components
// ----------
function TodoForm({ todos }) {
  return (
    <div style={styles.form}>
      <div style={styles.toggleAll} onClick={() => toggleAll(todos)}>
        ⌄
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addTodo(e.target[0].value);
          e.target[0].value = '';
        }}
      >
        <input
          style={styles.input}
          autoFocus
          placeholder="What needs to be done?"
          type="text"
        />
      </form>
    </div>
  );
}

function TodoList({ todos }) {
  return (
    <div style={styles.todoList}>
      {todos.map((todo) => (
        <div key={todo.id} style={styles.todo}>
          <input
            type="checkbox"
            key={todo.id}
            style={styles.checkbox}
            checked={todo.done}
            onChange={() => toggleDone(todo)}
          />
          <div style={styles.todoText}>
            {todo.done ? (
              <span style={{ textDecoration: 'line-through' }}>
                {todo.text}
              </span>
            ) : (
              <span>{todo.text}</span>
            )}
          </div>
          <span onClick={() => deleteTodo(todo)} style={styles.delete}>
            𝘟
          </span>
        </div>
      ))}
    </div>
  );
}

function ActionBar({ setVisible, todos }) {
  return (
    <div style={styles.actionBar}>
      <div># Remain: {todos.filter((todo) => !todo.done).length}</div>
      <div>
        <span
          style={{ marginRight: '5px', cursor: 'pointer' }}
          onClick={() => setVisible('all')}
        >
          All
        </span>
        <span
          style={{ marginRight: '5px', cursor: 'pointer' }}
          onClick={() => setVisible('remaining')}
        >
          Remaining
        </span>
        <span
          style={{ cursor: 'pointer' }}
          onClick={() => setVisible('completed')}
        >
          Completed
        </span>
      </div>
      <div style={{ cursor: 'pointer' }} onClick={() => deleteCompleted(todos)}>
        Clear Completed
      </div>
    </div>
  );
}

// Styles
// ----------
const styles = {
  container: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
  },
  header: {
    fontSize: '50px',
    fontColor: 'lightgray',
    marginBottom: '10px',
  },
  form: {
    display: 'flex',
    aignItems: 'center',
    border: '1px solid lightgray',
    borderBottomWidth: '0px',
    paddingLeft: '10px',
    width: '350px',
  },
  toggleAll: {
    fontSize: '30px',
    marginRight: '10px',
    marginTop: '-15px',
    cursor: 'pointer',
  },
  input: {
    width: '310px',
    padding: '8px',
    fontStyle: 'italic',
  },
  todoList: {
    width: '350px',
  },
  checkbox: {
    fontSize: '30px',
    marginLeft: '5px',
    marginRight: '20px',
    cursor: 'pointer',
  },
  todo: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px',
    border: '1px solid lightgray',
    borderBottomWidth: '0px',
  },
  todoText: {
    flexGrow: '1',
  },
  delete: {
    width: '25px',
    cursor: 'pointer',
    color: 'lightgray',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '350px',
    padding: '10px',
    border: '1px solid lightgray',
    fontSize: '10px',
  },
  footer: {
    marginTop: '20px',
    fontSize: '10px',
  },
};

function Page() {
  return (
    <div>
      <Head>
        <title>Instant Example App: Todo App</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <Wrapper />
    </div>
  );
}

export default Page;

/**
 * Schema for the todos example app.
 * Mirrors https://www.instantdb.com/examples/todos
 */

export const todosSchema = {
  entities: {
    todos: {
      attrs: {
        id: { unique: true, indexed: true },
        text: {},
        done: {},
        createdAt: { indexed: true },
      },
    },
  },
};

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

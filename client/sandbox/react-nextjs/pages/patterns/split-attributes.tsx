import { useEffect, useState } from "react";

import { init, tx, id } from "@instantdb/react";
import config from "../../config";
import Login from "../../components/Login";

const { transact, useQuery } = init(config);

function App() {
  const { isLoading, error, data } = useQuery({ todos: { todosPrivate: {} } });
  if (isLoading) { return <div>Loading...</div>; }
  if (error) { return <div>Uh oh! {error.message}</div>; }

  const { todos } = data;
  return (
    <div className="mx-w-md mx-auto p-4">
      <div className="font-bold">Todos</div>
      {todos.map(({ id, text }) => {
        return (
          <div key={id}>
            <p>{text}</p>
          </div>
        );
      })}
      {/* TODO: Finish this example */}
    </div>
  )
}

export default App;

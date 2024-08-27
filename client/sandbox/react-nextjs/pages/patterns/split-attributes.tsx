import { useState } from "react";

import { init, tx, id } from "@instantdb/react";
import config from "../../config";

const { transact, useQuery } = init(config);

function addFoo(text: string, privateText: string) {
  const privateFooId = id();
  transact([
    // First we create the private data
    tx.privateFoos[privateFooId].update({ privateText }),

    // And then we create the public data and link it with private
    tx.foos[id()].update({ text }).link({ privateFoos: privateFooId })
  ])
}

function deleteFoos(foos: any) {
  transact(foos.map((foo: any) => tx.foos[foo.id].delete()));
}

function App() {
  const { isLoading, error, data } = useQuery({ foos: { privateFoos: {} } });
  const [text, setText] = useState("");
  const [privateText, setPrivateText] = useState("");
  if (isLoading) { return <div>Loading...</div>; }
  if (error) { return <div>Uh oh! {error.message}</div>; }

  const handleSubmit = (e: any) => {
    e.preventDefault();
    addFoo(text, privateText);
  }

  const { foos } = data;
  return (
    <div className="mx-w-md mx-auto p-4 flex flex-col w-1/2 space-y-2">
      <div className="font-bold">Todos</div>
      <form className="space-y-2 flex flex-col" onSubmit={handleSubmit}>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="public text..." />
        <input type="text" value={privateText} onChange={(e) => setPrivateText(e.target.value)} placeholder="private text..." />
        <button className="py-2 border-2 border-black" type="submit">Add foo!</button>
      </form>
      <button className="py-2 border-2 border-black" onClick={() => deleteFoos(foos)}>Delete all</button>
      <div className="w-sm">
        <pre>{JSON.stringify(foos, null, 2)}</pre>
      </div>
    </div>
  )
}

export default App;

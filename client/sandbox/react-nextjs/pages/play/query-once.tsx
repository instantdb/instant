/*
 * Query Once example
 * The goal here is to show how we can use queryOnce to fetch data
 * without subscribing to updates but still get data from the server
 * to validate if the item already exists.
 * */

import { init, id, tx } from "@instantdb/react";
import Head from "next/head";
import { useEffect, FormEvent } from "react";
import config from "../../config";

const db = init<{
  onceTest: {
    text: string;
  };
}>(config);

async function queryOnceDemo(newItem: string) {
  console.log("newItem", newItem);

  // since we have an existing subscription to this query
  // this will result in an `add-query-exists`
  const existingQueryRes = await db.queryOnce({
    onceTest: {},
  });

  const res = await db.queryOnce({
    onceTest: { $: { where: { text: newItem } } },
  });

  console.log("res", res);
  console.log("existing onceTest", existingQueryRes);

  return res.data.onceTest.length > 0;
}

function addOnce(text: string) {
  db.transact(tx.onceTest[id()].update({ text }));
}

function deleteAll(items: any) {
  db.transact(items.map((item: any) => tx.onceTest[item.id].delete()));
}

interface FormProps {
  addOnce: (value: string) => void;
}
const TodoForm: React.FC<FormProps> = ({ addOnce }) => {
  useEffect(() => {
    db.queryOnce({
      onceTest: {},
    }).then((r) => console.log("initial onceTest", r));
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem(
      "todoInput",
    ) as HTMLInputElement;
    if (input && input.value.trim()) {
      if (await queryOnceDemo(input.value)) {
        alert("Item already exists");
      } else {
        addOnce(input.value);
        input.value = "";
      }
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        name="todoInput"
        autoFocus
        placeholder="What needs to be done?"
        type="text"
      />
    </form>
  );
};

function Main() {
  const { isLoading, error, data } = db.useQuery({
    onceTest: {},
  });
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return (
    <div className="p-2">
      <div className="flex space-x-2 py-2">
        <div>Query Once test</div>
        <button
          className="border px-4 border-black"
          onClick={() => deleteAll(data.onceTest)}
        >
          Delete All
        </button>
      </div>
      <TodoForm addOnce={addOnce} />
      {data.onceTest.map((todo: any) => (
        <div key={todo.id}>{todo.text}</div>
      ))}
    </div>
  );
}

function Page() {
  return (
    <div>
      <Head>
        <title>Instant Example App: Query Once</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <Main />
    </div>
  );
}

export default Page;

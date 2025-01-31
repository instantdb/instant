/*
 * Query Once example
 * The goal here is to show how we can use queryOnce to fetch data
 * without subscribing to updates but still get data from the server
 * to validate if the item already exists.
 * */

import { init, id, tx, i } from "@instantdb/react";
import Head from "next/head";
import { useEffect, FormEvent } from "react";
import config from "../../config";

const schema = i.schema({
  entities: {
    onceTest: i.entity({ text: i.string() }),
  }
});

const db = init({...config, schema});

function _subsCount() {
  return Object.values(db._core._reactor.queryOnceDfds).flat().length;
}

async function queryOnceDemo(newItem: string) {
  console.log("dfs count before:", _subsCount());
  console.log("newItem", newItem);

  // since we have an existing subscription to this query
  // this will result in an `add-query-exists`
  const existingQueryP = db.queryOnce({
    onceTest: {},
  });

  const checkP = db.queryOnce({
    onceTest: { $: { where: { text: newItem } } },
  });

  console.log("dfs count when pending:", _subsCount());

  const [checkRes, existingQueryRes] = await Promise.all([
    checkP,
    existingQueryP,
  ]);

  console.log("res", checkRes);
  console.log("existing onceTest", existingQueryRes);
  console.log("dfs count after:", _subsCount());

  return checkRes.data.onceTest.length > 0;
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

import { useState } from 'react';

import { init, tx, id } from '@instantdb/react';
import config from '../../config';

const { transact, useQuery } = init(config);

function addItem(field: string, privateField: string) {
  const privateItemsId = id();
  transact([
    // First we create the private data
    tx.privateItems[privateItemsId].update({ privateField }),

    // And then we create the public data and link it with private
    tx.items[id()]
      .update({ text: field })
      .link({ privateItems: privateItemsId }),
  ]);
}

function deleteItems(items: any) {
  transact(items.map((foo: any) => tx.items[foo.id].delete()));
}

function App() {
  const { isLoading, error, data } = useQuery({ items: { privateItems: {} } });
  const [field, setField] = useState('');
  const [privateField, setPrivateField] = useState('');
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }

  const handleSubmit = (e: any) => {
    e.preventDefault();
    addItem(field, privateField);
  };

  const { items } = data;
  return (
    <div className="mx-w-md mx-auto flex w-1/2 flex-col space-y-2 p-4">
      <div className="font-bold">Todos</div>
      <form className="flex flex-col space-y-2" onSubmit={handleSubmit}>
        <input
          type="text"
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder="public field..."
        />
        <input
          type="text"
          value={privateField}
          onChange={(e) => setPrivateField(e.target.value)}
          placeholder="private field..."
        />
        <button className="border-2 border-black py-2" type="submit">
          Add item!
        </button>
      </form>
      <button
        className="border-2 border-black py-2"
        onClick={() => deleteItems(items)}
      >
        Delete all
      </button>
      <div className="w-sm">
        <pre>{JSON.stringify(items, null, 2)}</pre>
      </div>
    </div>
  );
}

export default App;

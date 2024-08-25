'use client';

import config from '@/lib/config'; // hide-line
import { init, tx, id } from '@instantdb/react';

// Connect to the database
// ---------
const db = init({
  ...config, // hide-line
  appId: __getAppId(),
});

function addMessage(text: string) {
  db.transact(
    tx.messages[id()].update({
      text,
      createdAt: new Date(),
    })
  );
}

function App() {
  // Read Data
  const { isLoading, error, data } = db.useQuery({ messages: {} });
  if (isLoading) return <div>Fetching data...</div>;
  if (error) return <div>Error fetching data: {error.message}</div>;
  const { messages } = data;

  const sortedMessages = messages.sort(
    (a, b) =>
      // @ts-expect-error
      new Date(a.createdAt) - new Date(b.createdAt)
  );

  return (
    <div className="p-4">
      <form
        className="flex space-x-2"
        onSubmit={(e: any) => {
          e.preventDefault();
          addMessage(e.target[0].value);
          e.target[0].value = '';
        }}
      >
        <input placeholder="What needs to be done?" type="text" />
        <button type="submit">Add</button>
      </form>
      {sortedMessages.map((message) => (
        <div key={message.id}>{message.text}</div>
      ))}
    </div>
  );
}

export default App;

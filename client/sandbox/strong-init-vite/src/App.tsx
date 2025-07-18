declare global {
  // eslint-disable-next-line no-var
  var dLog: (...args: unknown[]) => void;
}

globalThis.dLog = (...args: unknown[]) => {
  console.log('drew:', ...args);
};
import { init, User } from '@instantdb/react';
import schema from '../instant.schema';
import React from 'react';

const db = init({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema,
  useDateObjects: true,
});

function App() {
  const { isLoading, data, error } = db.useQuery({ messages: { creator: {} } });
  if (isLoading || error) return null;
  const { messages } = data;

  return (
    <div>
      <div>
        {messages.map((m) => (
          <div key={m.id}>{m.content}</div>
        ))}
      </div>
      <button
        onClick={() => {
          db.transact(
            db.tx.messages[id()].update({ content: 'Hello, world!' }),
          );
        }}
      >
        Add message
      </button>
      <button
        onClick={() => {
          db.transact(messages.map((m) => db.tx.messages[m.id].delete()));
        }}
      >
        Clear Messages
      </button>
    </div>
  );
}

export default App;

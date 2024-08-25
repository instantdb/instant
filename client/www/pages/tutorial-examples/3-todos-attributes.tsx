'use client';

import config from '@/lib/config'; // hide-line
import { init, tx, id } from '@instantdb/react';

// Connect to the database
// ---------
const db = init({
  ...config, // hide-line
  appId: __getAppId(),
});

// Write Data
// ---------
function addMessage(text: string) {
  db.transact(
    tx.messages[id()].update({
      text,
      createdAt: new Date(),
    })
  );
}

function deleteMessage(messageId: string) {
  db.transact(tx.message[messageId].delete());
}

function updateMessage(messageId: string, newText: string) {
  db.transact(
    tx.messages[messageId].update({ text: newText, updatedAt: Date.now() })
  );
}

function toggleEdit(messageId: string) {
  const newText = prompt('Edit your message:');
  if (newText) {
    updateMessage(messageId, newText);
  }
}

function App() {
  // Read Data
  const { isLoading, error, data } = db.useQuery({ messages: {} });
  if (isLoading) {
    return <div>Fetching data...</div>;
  }
  if (error) {
    return <div>Error fetching data: {error.message}</div>;
  }

  const { messages } = data;
  const sortedMessages = messages.sort((a, b) => a.createdAt - b.createdAt);
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
        <div key={message.id} className="flex items-center space-x-2">
          <div>{message.text}</div>
          <button onClick={() => toggleEdit(message.id)}>✏️</button>
          <button onClick={() => deleteMessage(message.id)}>❌</button>
          {message.updatedAt && (
            <div>
              Updated at: {new Date(message.updatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default App;

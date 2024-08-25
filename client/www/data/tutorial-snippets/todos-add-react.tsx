'use client'; 

import { useState } from 'react';

function addMessage(setMessages: any, text: string) {
  setMessages((messages: any) => [
    ...messages,
    {
      text,
      createdAt: new Date(),
    },
  ]);
}

function App() {
  // Read Data
  const [messages, setMessages] = useState<
    { id: string; text: string; createdAt: string }[]
  >([]);

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
          addMessage(setMessages, e.target[0].value);
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

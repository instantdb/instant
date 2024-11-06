import { useState } from "react";
import { id, init_experimental } from "@instantdb/react";
import graph from "../instant.schema";

const db = init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema: graph,
  apiURI: "http://localhost:8888",
  websocketURI: "ws://localhost:8888/runtime/session",
});

function App() {
  const { isLoading, data, error } = db.useQuery({ messages: {} });
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
            db.tx.messages[id()].update({ content: "Hello, world!" }),
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

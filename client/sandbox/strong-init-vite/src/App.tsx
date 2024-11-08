import { id, init_experimental } from "@instantdb/react";
import graph from "../instant.schema";

const db = init_experimental({
  appId: import.meta.env.VITE_INSTANT_APP_ID,
  schema: graph,
  apiURI: "http://localhost:8888",
  websocketURI: "ws://localhost:8888/runtime/session",
});

function App() {
  const { isLoading, data, error } = db.useQuery({ messages: { profile: {} } });
  if (isLoading || error) return null;
  const { messages } = data;

  return (
    <div>
      <div>
        {messages.map((m) => (
          <div key={m.id}>
            {m.profile?.name} | {m.content}
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          const profileId = id();
          db.transact([
            db.tx.profiles[profileId].update({ name: "Alice" }),
            db.tx.messages[id()]
              .update({ content: "Hello, world!" })
              .link({ profile: profileId }),
          ]);
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

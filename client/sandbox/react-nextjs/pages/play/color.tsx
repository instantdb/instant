import { i, init, tx } from "@instantdb/react";
import { useEffect } from "react";
import config from "../../config";

const schema = i.schema({
  entities: {
    colors: i.entity({ color: i.string() }),
  }
});

const db = init({ ...config, schema });

function App() {
  return <Main />;
}

const selectId = "4d39508b-9ee2-48a3-b70d-8192d9c5a059";

function Main() {
  useEffect(() => {
    (async () => {
      const id = await db.getLocalId("user");
      console.log("localId", id);
    })();
  }, []);
  const { isLoading, error, data } = db.useQuery({
    colors: {},
  });
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  const { colors } = data;
  const { color } = colors[0] || { color: "grey" };
  return (
    <div style={{ background: color, height: "100vh" }}>
      <div className="space-y-4">
        <h1>Hi! pick your favorite color</h1>
        <div className="space-x-4">
          {["green", "blue", "purple"].map((c) => {
            return (
              <button
                onClick={() => {
                  db.transact(tx.colors[selectId].update({ color: c }));
                }}
                className={`bg-white p-2`}
                key={c}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;

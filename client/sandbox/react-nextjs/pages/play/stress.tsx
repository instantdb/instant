import { useEffect, useState } from "react";
import config from "../../config";
import { init, tx, id } from "@instantdb/react";
import { useRouter } from "next/router";

function Example({ appId }: { appId: string }) {
  const router = useRouter();
  const myConfig = { ...config, appId };
  const db = init(myConfig);

  const { data } = db.useQuery({ goals: {} });

  let maxNumber = 0;
  for (const g of data?.goals || []) {
    maxNumber = Math.max(maxNumber, g.number ?? 0);
  }

  function shuffle(array: any[]) {
    let currentIndex = array.length,
      randomIndex;

    // While there remain elements to shuffle...
    while (currentIndex != 0) {
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;

      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex],
      ];
    }

    return array;
  }

  const generateGoals = async (n: number) => {
    const startFrom = maxNumber + 1;
    const txes = [];
    const props = ["a", "b", "c", "d", "e", "f", "g", "h"];
    for (let i = 0; i < n; i++) {
      const number = startFrom + i;
      shuffle(props);
      const goal: Record<any, any> = { number, title: `Goal ${number}` };
      for (const prop of props.slice(0, 4)) {
        goal[prop] = prop;
      }
      const t = tx.goals[id()].update(goal);
      db.transact(t);
      //txes.push(t);
    }
    //await db.transact(txes);
  };

  const deleteAll = async () => {
    await db.transact((data?.goals || []).map((g) => tx.goals[g.id].delete()));
  };

  const [count, setCount] = useState(10);
  return (
    <div>
      <div>
        <div>
          <button
            className="bg-black text-white m-2 p-2"
            onClick={() => generateGoals(count)}
          >
            Generate {count} goals
          </button>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
          />
        </div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => generateGoals(1)}
        >
          Add one goal
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => deleteAll()}
        >
          Delete all
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() =>
            router.push({
              ...router,
              query: {},
            })
          }
        >
          Start over
        </button>
      </div>
      <div className="p-2"></div>
      <div className="flex">
        <div className="p-2">
          <details open>
            <summary>All goals ({data?.goals.length || 0}):</summary>

            {data?.goals.map((g) => (
              <div key={g.id}>
                <button
                  onClick={() => {
                    db.transact([tx.goals[g.id].delete()]);
                  }}
                >
                  X
                </button>{" "}
                {g.title}
              </div>
            ))}
          </details>
        </div>
      </div>
    </div>
  );
}

async function provisionEphemeralApp() {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "Pagination example",
      // Uncomment and start a new app to test rules
      /* rules: {
        code: {
          goals: {
            allow: {
              // data.number % 2 == 0 gives me a typecasting error
              // so does int(data.number) % 2 == 0
              view: "data.number == 2 || data.number == 4 || data.number == 6 || data.number == 8 || data.number == 10",
            },
          },
        },
      }, */
    }),
  });

  return r.json();
}

async function verifyEphemeralApp({ appId }: { appId: string }) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  return r.json();
}

function App({ urlAppId }: { urlAppId: string | undefined }) {
  const router = useRouter();
  const [appId, setAppId] = useState();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appId) {
      return;
    }
    if (urlAppId) {
      verifyEphemeralApp({ appId: urlAppId }).then((res): any => {
        if (res.app) {
          setAppId(res.app.id);
        } else {
          provisionEphemeralApp().then((res) => {
            if (res.app) {
              router.replace({
                pathname: router.pathname,
                query: { ...router.query, app: res.app.id },
              });

              setAppId(res.app.id);
            } else {
              console.log(res);
              setError("Could not create app.");
            }
          });
        }
      });
    } else {
      provisionEphemeralApp().then((res) => {
        if (res.app) {
          router.replace({
            pathname: router.pathname,
            query: { ...router.query, app: res.app.id },
          });

          setAppId(res.app.id);
        } else {
          console.log(res);
          setError("Could not create app.");
        }
      });
    }
  }, []);

  if (error) {
    return (
      <div>
        <p>There was an error</p>
        <p>{error}</p>
      </div>
    );
  }

  if (!appId) {
    return <div>Loading...</div>;
  }
  return <Example appId={appId} />;
}

function Page() {
  const router = useRouter();
  if (router.isReady) {
    return <App urlAppId={router.query.app as string} />;
  } else {
    return <div>Loading...</div>;
  }
}

export default Page;

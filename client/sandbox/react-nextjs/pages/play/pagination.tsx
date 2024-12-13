import { useEffect, useState } from "react";
import config from "../../config";
import { init, tx, id, i } from "@instantdb/react";
import { useRouter } from "next/router";

const schema = i.graph(
  {
    goals: i.entity({
      number: i.number().indexed(),
      date: i.date().indexed(),
      string: i.string().indexed(),
      boolean: i.boolean().indexed(),
      title: i.string(),
      sometimesNull: i.number().indexed(),
      sometimesNullOrUndefined: i.number().indexed(),
      sometimesNullDate: i.date().indexed(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
  },
  {},
);

function Example({ appId }: { appId: string }) {
  const router = useRouter();
  const myConfig = { ...config, appId, schema };
  const db = init(myConfig);

  const { data } = db.useQuery({ goals: {} });

  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState(5);
  const [orderField, setOrderField] = useState("date");

  const order = { [orderField]: direction };

  const { data: firstFiveData, error: firstFiveError } = db.useQuery({
    goals: { $: { limit: limit, order } },
  });

  const {
    data: secondFiveData,
    error: secondFiveError,
    pageInfo,
  } = db.useQuery({
    goals: {
      $: { limit: limit, offset: limit, order },
    },
  });

  const {
    data: thirdFiveData,
    error: thirdFiveError,
    pageInfo: thirdFivePageInfo,
  } = db.useQuery({
    goals: {
      $: {
        limit: limit,
        offset: limit * 2,
        order,
      },
    },
  });

  const endCursor = pageInfo?.goals?.endCursor;
  const startCursor = pageInfo?.goals?.startCursor;

  const { data: afterData, error: afterError } = db.useQuery({
    goals: {
      $: {
        limit: limit,
        after: endCursor,
        order,
      },
    },
  });

  const { data: beforeData, error: beforeError } = db.useQuery({
    goals: {
      $: {
        last: limit,
        before: thirdFivePageInfo?.goals?.startCursor,
        order,
      },
    },
  });

  let maxNumber = -10;
  for (const g of data?.goals || []) {
    maxNumber = Math.max(maxNumber, g.number ?? 0);
  }

  const generateGoals = async (n: number) => {
    const startFrom = maxNumber + 1;
    for (let i = 0; i < n; i++) {
      const number = startFrom + i;
      await db.transact([
        tx.goals[id()].update({
          number,
          date: number,
          string: `${number}`,
          boolean: number % 2 === 0,
          title: `Goal ${number}`,
          sometimesNull: number % 2 === 0 ? null : number,
          sometimesNullDate: number % 2 === 0 ? null : number,
          sometimesNullOrUndefined:
            number % 3 === 0 ? undefined : number % 3 === 1 ? null : number,
        }),
      ]);
    }
  };

  const deleteAll = async () => {
    await db.transact((data?.goals || []).map((g) => tx.goals[g.id].delete()));
  };

  function displayValue(x: any) {
    if (orderField === "serverCreatedAt") {
      return x.title;
    }
    return `${x.title}, ${orderField}=${x[orderField]}`;
  }
  return (
    <div>
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => generateGoals(15)}
        >
          Generate some goals
        </button>
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
      <div className="p-2">
        <select
          value={orderField}
          onChange={(e) => setOrderField(e.target.value)}
        >
          <option value="serverCreatedAt">serverCreatedAt</option>
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="date">date</option>
          <option value="boolean">boolean</option>
          <option value="sometimesNull">sometimesNull</option>
          <option value="sometimesNullOrUndefined">
            sometimesNullOrUndefined
          </option>
          <option value="sometimesNullDate">sometimesNullDate</option>
          <option value="title">title (not sortable)</option>
        </select>
        <select
          value={direction}
          onChange={(e) =>
            // @ts-expect-error
            setDirection(e.target.value)
          }
        >
          <option value="asc">asc</option>
          <option value="desc">desc</option>
        </select>
        <select
          value={limit}
          onChange={(e) => setLimit(parseInt(e.target.value, 10))}
        >
          {[...Array(data?.goals.length || 0 + 5)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>
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
                {displayValue(g)}
              </div>
            ))}
          </details>
        </div>

        <div className="p-2">
          <details open>
            <summary>First {limit} goals</summary>
            {firstFiveError ? (
              <pre>{JSON.stringify(firstFiveError, null, 2)}</pre>
            ) : null}
            {firstFiveData?.goals.map((g) => (
              <div key={g.id}>{displayValue(g)}</div>
            ))}
          </details>
        </div>

        <div className="p-2">
          <details open>
            <summary>Second {limit} goals</summary>
            {secondFiveError ? (
              <pre>{JSON.stringify(secondFiveError, null, 2)}</pre>
            ) : null}
            {secondFiveData?.goals.map((g) => (
              <div key={g.id}>{displayValue(g)}</div>
            ))}
          </details>
        </div>

        <div className="p-2">
          <details open>
            <summary>Third {limit} goals</summary>
            {thirdFiveError ? (
              <pre>{JSON.stringify(thirdFiveError, null, 2)}</pre>
            ) : null}
            {thirdFiveData?.goals.map((g) => (
              <div key={g.id}>{displayValue(g)}</div>
            ))}
          </details>
        </div>

        <div className="p-2">
          <details open>
            <summary>After second goals</summary>
            {afterError ? (
              <pre>{JSON.stringify(afterError, null, 2)}</pre>
            ) : null}
            {!endCursor
              ? null
              : afterData?.goals.map((g) => (
                  <div key={g.id}>{displayValue(g)}</div>
                ))}
          </details>
        </div>

        <div className="p-2">
          <details open>
            <summary>Before third goals</summary>
            {beforeError ? (
              <pre className="max-w-48">
                {JSON.stringify(beforeError, null, 2)}
              </pre>
            ) : null}
            {!thirdFivePageInfo?.goals?.startCursor
              ? null
              : beforeData?.goals.map((g) => (
                  <div key={g.id}>{displayValue(g)}</div>
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

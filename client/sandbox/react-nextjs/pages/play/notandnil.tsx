import { useEffect, useState } from "react";
import config from "../../config";
import { init, tx, id } from "@instantdb/react";
import { useRouter } from "next/router";

function Example({ appId }: { appId: string }) {
  const router = useRouter();
  const myConfig = { ...config, appId };
  const db = init(myConfig);

  const { data } = db.useQuery({ items: {} });

  const { data: isNullTrueData } = db.useQuery({
    items: { $: { where: { val: { $isNull: true } } } },
  });

  const { data: isNullFalseData } = db.useQuery({
    items: { $: { where: { val: { $isNull: false } } } },
  });

  const { data: notData } = db.useQuery({
    items: { $: { where: { val: { $not: "a" } } } },
  });

  return (
    <div>
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({ val: null }))}
        >
          Create item with null val
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({}))}
        >
          Create item with undefined val
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({ val: "a" }))}
        >
          Create item with val = "a"
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({ val: "b" }))}
        >
          Create item with val != "a"
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => {
            window.location.href = router.pathname;
          }}
        >
          Start over
        </button>
      </div>
      <div className="p-2"></div>
      <div className="flex">
        <div className="p-2">
          <details open>
            <summary>All items ({data?.items.length || 0}):</summary>

            {data?.items.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => {
                    db.transact([tx.items[item.id].delete()]);
                  }}
                >
                  X
                </button>{" "}
                val ={" "}
                {item.val === undefined
                  ? "undefined"
                  : JSON.stringify(item.val)}
              </div>
            ))}
          </details>
        </div>
        <div className="p-2">
          <details open>
            <summary>
              isNull=true items ({isNullTrueData?.items.length || 0}):
            </summary>

            {isNullTrueData?.items.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => {
                    db.transact([tx.items[item.id].delete()]);
                  }}
                >
                  X
                </button>{" "}
                val ={" "}
                {item.val === undefined
                  ? "undefined"
                  : JSON.stringify(item.val)}
              </div>
            ))}
          </details>
        </div>
        <div className="p-2">
          <details open>
            <summary>
              isNull=false items ({isNullFalseData?.items.length || 0}):
            </summary>

            {isNullFalseData?.items.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => {
                    db.transact([tx.items[item.id].delete()]);
                  }}
                >
                  X
                </button>{" "}
                val ={" "}
                {item.val === undefined
                  ? "undefined"
                  : JSON.stringify(item.val)}
              </div>
            ))}
          </details>
        </div>
        <div className="p-2">
          <details open>
            <summary>not val=a items ({notData?.items.length || 0}):</summary>

            {notData?.items.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => {
                    db.transact([tx.items[item.id].delete()]);
                  }}
                >
                  X
                </button>{" "}
                val ={" "}
                {item.val === undefined
                  ? "undefined"
                  : JSON.stringify(item.val)}
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

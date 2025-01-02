import { useEffect, useState } from "react";
import config from "../../config";
import { init, tx, id, i } from "@instantdb/react";
import { useRouter } from "next/router";

const schema = i.schema({
  entities: {
    items: i.entity({
      val: i.string().indexed(),
    }),
    link: i.entity({
      val: i.string().indexed(),
    }),
  },
  links: {
    valLink: {
      forward: {
        on: "items",
        has: "one",
        label: "link",
      },
      reverse: {
        on: "link",
        has: "many",
        label: "items",
      },
    },
  },
});

function Example({ appId }: { appId: string }) {
  const router = useRouter();
  const myConfig = { ...config, appId, schema };
  const db = init(myConfig);

  const { data } = db.useQuery({ items: {} });

  const { data: isEquality } = db.useQuery({
    items: { $: { where: { val: { $like: "%Go Team Instant%" } } } },
  });

  const { data: isStartsWith } = db.useQuery({
    items: { $: { where: { val: { $like: "%Go%" } } } },
  });

  const { data: isEndsWith } = db.useQuery({
    items: { $: { where: { val: { $like: "%Instant%" } } } },
  });

  const { data: isContains } = db.useQuery({
    items: { $: { where: { val: { $like: "%Team%" } } } },
  });

  const { data: isContainsLink } = db.useQuery({
    items: { $: { where: { "link.val": { $like: "%moop%" } } } },
  });

  console.log({
    data,
    isEquality,
    isStartsWith,
    isEndsWith,
    isContains,
    isContainsLink,
  });
  return (
    <div>
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() =>
            db.transact(tx.items[id()].update({ val: "Go Team Instant" }))
          }
        >
          Create item with val = "Go Team Instant"
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({ val: "Instant" }))}
        >
          Create item with val = "Instant"
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({ val: null }))}
        >
          Create item with val = null
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => {
            const linkId = id();
            db.transact([
              tx.link[linkId].update({ val: "super moop" }),
              tx.items[id()].update({}).link({ link: linkId }),
            ]);
          }}
        >
          Create link with val = "super moop"
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => {
            const linkId = id();
            db.transact([
              tx.link[linkId].update({ val: "womp" }),
              tx.items[id()].update({}).link({ link: linkId }),
            ]);
          }}
        >
          Create link with val = "womp"
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
              equals 'Go Team Instant': ({isEquality?.items.length || 0}):
            </summary>

            {isEquality?.items.map((item) => (
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
              starts with 'Go%' ({isStartsWith?.items.length || 0}):
            </summary>

            {isStartsWith?.items.map((item) => (
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
              ends with "Instant" ({isEndsWith?.items.length || 0}):
            </summary>

            {isEndsWith?.items.map((item) => (
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
              links like "%moop%" ({isContainsLink?.items.length || 0}):
            </summary>

            {isContainsLink?.items.map((item) => (
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
      title: "Query Like Sandbox",
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

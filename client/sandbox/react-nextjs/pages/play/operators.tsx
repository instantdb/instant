import { useEffect, useState } from "react";
import config from "../../config";
import { init, tx, id, i } from "@instantdb/react";
import { useRouter } from "next/router";

const schema = i.schema({
  entities: {
    comments: i.entity({
      slug: i.string().unique().indexed(),
      someString: i.string().indexed(),
      date: i.date().indexed(),
      order: i.number().indexed(),
      bool: i.boolean().indexed(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
  },
  links: {
    commentAuthors: {
      forward: {
        on: "comments",
        has: "one",
        label: "author",
      },
      reverse: {
        on: "$users",
        has: "many",
        label: "authoredComments",
      },
    },
  },
});

function randInt(max: number) {
  return Math.floor(Math.random() * max);
}

const d = new Date();

function Example({ appId }: { appId: string }) {
  const router = useRouter();
  const myConfig = { ...config, appId, schema };
  const db = init(myConfig);

  const { data } = db.useQuery({
    comments: {
      $: { where: { order: { $gt: 50 } } },
    },
  });

  return (
    <div>
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() =>
            db.transact(
              tx.comments[id()].update({
                order: randInt(100),
                date: new Date(),
                someString: "a".repeat(randInt(20)),
                bool: randInt(2) === 1,
              }),
            )
          }
        >
          Add random item
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() =>
            db.transact(
              tx.comments[id()].update({
                order: 50,
              }),
            )
          }
        >
          Add order = 50
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
            <summary>All items ({data?.comments?.length || 0}):</summary>

            {data?.comments?.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => {
                    db.transact([tx.items[item.id].delete()]);
                  }}
                >
                  X
                </button>{" "}
                order = {item.order}
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
      title: "Comparisons example",
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

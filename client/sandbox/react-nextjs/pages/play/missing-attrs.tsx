import { useEffect, useState } from "react";
import config from "../../config";
import { init, tx, id, i } from "@instantdb/react";
import { useRouter } from "next/router";

const schema = i.schema({
  entities: {
    comments: i.entity({
      slug: i.string().unique().indexed(),
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

function Example({ appId, useSchema }: { appId: string; useSchema: boolean }) {
  const myConfig = { ...config, appId };
  const db = useSchema
    ? init({ ...myConfig, schema })
    : (init(myConfig) as any);
  const q = db.useQuery({ comments: {} });
  const [attrs, setAttrs] = useState<any>();
  useEffect(() => {
    const unsub = db._core._reactor.subscribeAttrs((res: any) => {
      setAttrs(res);
    });
    return unsub;
  });

  return (
    <div>
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() =>
            db.transact(
              tx.comments[id()].update({ slug: "oi" }).link({ author: id() }),
            )
          }
        >
          Create comment
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() =>
            db.transact(tx.profiles[id()].update({ name: "stonado" }))
          }
        >
          Create something that isnt' in schema
        </button>
      </div>
      <div className="p-2"></div>
      <div>
        <div className="bold">Using Schema? = {JSON.stringify(useSchema)}</div>
        <div>Attrs:</div>
        <pre>
          {JSON.stringify(
            Object.values(attrs || {}).filter(
              (x: any) => x.catalog !== "system",
            ),
            null,
            2,
          )}
          {JSON.stringify(q, null, 2)}
        </pre>
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

function App({
  urlAppId,
  useSchema,
}: {
  urlAppId: string | undefined;
  useSchema: boolean;
}) {
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

  return <Example appId={appId} useSchema={useSchema} />;
}

function Page() {
  const router = useRouter();
  if (router.isReady) {
    return (
      <App
        urlAppId={router.query.app as string}
        useSchema={router.query.schema === "true"}
      />
    );
  } else {
    return <div>Loading...</div>;
  }
}

export default Page;

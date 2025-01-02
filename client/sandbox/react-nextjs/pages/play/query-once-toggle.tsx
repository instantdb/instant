/*
 * There was a bug where if we toggled connections on and off,
 * we could enter a state where multiple _ws instances were active.
 *
 * This led to a weird bug where queryOnce would hang. Use this
 * playground if you ever want to reproduce the bug.
 *
 *
 */

import { init, i } from "@instantdb/react";
import Head from "next/head";
import { useEffect, FormEvent, useRef, useState } from "react";
import config from "../../config";

const schema = i.schema({
  entities: {
    onceTest: i.entity({ text: i.string() }),
    posts: i.entity({ title: i.string() }),
  },
});

const db = init({
  ...config,
  schema,
});

function useEffectOnce(cb: () => void) {
  const r = useRef(false);
  useEffect(() => {
    if (r.current) return;
    r.current = true;
    cb();
  }, []);
}

function Main() {
  const [result, setResult] = useState<any>({ isLoading: true });
  useEffectOnce(() => {
    setTimeout(() => {
      const p1 = db.queryOnce({ posts: {} });
      window.dispatchEvent(new Event("offline"));
      const p2 = db
        .queryOnce({ posts: {} })
        .catch((e) => console.log("expected fail, we are offline"));
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
      const p3 = db.queryOnce({ posts: {} });
      Promise.all([p1, p3]).then(
        (succ) => {
          console.log(
            "Check inspector; how many active ws connections do you see?",
          );
          setResult({ succ });
        },
        (err) => {
          console.error(
            "Uh oh, we should definitely have gotten a response here",
          );
          setResult({ err });
        },
      );
    }, 3000);
  });
  return (
    <div>
      <h1>Query Once Toggle</h1>
      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}

function Page() {
  return (
    <div>
      <Head>
        <title>Instant Example App: Query Once Toggle</title>
        <meta
          name="description"
          content="Relational Database, on the client."
        />
      </Head>
      <Main />
    </div>
  );
}

export default Page;

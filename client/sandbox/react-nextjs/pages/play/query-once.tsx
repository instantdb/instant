/*
 * Query Once example
 * The goal here is to show how we can use queryOnce to fetch data
 * without subscribing to updates but still get data from the server
 * to validate if the item already exists.
 * */

import { init, id, tx } from "@instantdb/react";
import Head from "next/head";
import { useEffect, FormEvent, useRef, useState } from "react";
import config from "../../config";

const db = init<{
  onceTest: {
    text: string;
  };
}>({
  ...config,
  // apiURI: "https://api.instantdb.com",
  // websocketURI: "wss://api.instantdb.com/runtime/session",
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
      const p1 = db.queryOnce({ onceTest: {} });
      window.dispatchEvent(new Event("offline"));
      const p2 = db.queryOnce({ onceTest: {} }).catch(e => console.log('expected fail'));
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("offline"));
      window.dispatchEvent(new Event("online"));
      const p3 = db.queryOnce({ onceTest: {} });
      Promise.all([p1, p3]).then(
        (succ) => {
          setResult({ succ });
        },
        (err) => {
          setResult({ err });
        },
      );
    }, 3000);
  });
  return (
    <div>
      <h1>Query Once</h1>
      <pre>{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}

function Page() {
  return (
    <div>
      <Head>
        <title>Instant Example App: Query Once</title>
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

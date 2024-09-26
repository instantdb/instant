import { init } from "@instantdb/react";
import { useEffect } from "react";
import config from "../../config";

const db = init<{
  habits: {
    name: string;
  };
}>(config);

async function queryOnceDemo() {
  const res = await db.queryOnce({
    habits: {
      $: { limit: 1 },
    },
  });

  console.log(res.data.habits);
}

export default function () {
  useEffect(() => {
    queryOnceDemo();
  }, []);

  return null;
}

import { init } from "@instantdb/admin";
const APP_ID = "137ace7a-efdd-490f-b0dc-a3c73a14f892";
const ADMIN_TOKEN = "82900c15-faac-495b-b385-9f9e7743b629";
const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  apiURI: "http://localhost:8888",
});

export default async function Page() {
  const query = await db.query({
    goals: {},
  });
  return (
    <div>
      We just made a query via the app router. Load this page twice. Confirm
      that you see it in your clojure server both times. By default, nextjs
      caches fetch.
      {JSON.stringify(query, null, 2)}
    </div>
  );
}

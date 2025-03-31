import { init } from '@instantdb/admin';

import config from '../../../config';

const db = init({
  ...config,
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
});

export const dynamic = 'force-dynamic';

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

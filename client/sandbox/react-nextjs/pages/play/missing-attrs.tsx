import { useEffect, useState } from 'react';
import config from '../../config';
import { init, tx, id, i } from '@instantdb/react';
import { useRouter } from 'next/router';
import EphemeralAppPage from '../../components/EphemeralAppPage';

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
        on: 'comments',
        has: 'one',
        label: 'author',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'authoredComments',
      },
    },
  },
});

function Example({ appId }: { appId: string }) {
  const router = useRouter();
  const useSchema = router.query.schema === 'true';

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
              tx.comments[id()].update({ slug: 'oi' }).link({ author: id() }),
            )
          }
        >
          Create comment
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() =>
            db.transact(tx.profiles[id()].update({ name: 'stonado' }))
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
              (x: any) => x.catalog !== 'system',
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

function Page() {
  const router = useRouter();

  if (!router.isReady) {
    return <div>Loading...</div>;
  }
  const useSchema = router.query.schema === 'true';

  return useSchema ? (
    <EphemeralAppPage Component={Example} schema={schema} />
  ) : (
    <EphemeralAppPage Component={Example} />
  );
}

export default Page;

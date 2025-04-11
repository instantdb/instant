import { tx, id, i, InstantReactAbstractDatabase } from '@instantdb/react';

import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

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

function randInt(max: number) {
  return Math.floor(Math.random() * max);
}

const d = new Date();

function Example({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
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
                someString: 'a'.repeat(randInt(20)),
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
        <ResetButton
          className="bg-black text-white m-2 p-2"
          label="Start over"
        />
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
                </button>{' '}
                order = {item.order}
              </div>
            ))}
          </details>
        </div>
      </div>
    </div>
  );
}

function Page() {
  return <EphemeralAppPage schema={schema} Component={Example} />;
}

export default Page;

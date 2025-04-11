import { tx, id, i, InstantReactAbstractDatabase } from '@instantdb/react';

import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

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
        on: 'items',
        has: 'one',
        label: 'link',
      },
      reverse: {
        on: 'link',
        has: 'many',
        label: 'items',
      },
    },
  },
});

function Example({ db }: { db: InstantReactAbstractDatabase<typeof schema> }) {
  const { data } = db.useQuery({ items: {} });

  const { data: isEquality } = db.useQuery({
    items: { $: { where: { val: { $like: '%Go Team Instant%' } } } },
  });

  const { data: isStartsWith } = db.useQuery({
    items: { $: { where: { val: { $like: '%Go%' } } } },
  });

  const { data: isEndsWith } = db.useQuery({
    items: { $: { where: { val: { $like: '%Instant%' } } } },
  });

  const { data: isContains } = db.useQuery({
    items: { $: { where: { val: { $like: '%Team%' } } } },
  });

  const { data: isContainsLink } = db.useQuery({
    items: { $: { where: { 'link.val': { $like: '%moop%' } } } },
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
            db.transact(tx.items[id()].update({ val: 'Go Team Instant' }))
          }
        >
          Create item with val = "Go Team Instant"
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({ val: 'Instant' }))}
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
              tx.link[linkId].update({ val: 'super moop' }),
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
              tx.link[linkId].update({ val: 'womp' }),
              tx.items[id()].update({}).link({ link: linkId }),
            ]);
          }}
        >
          Create link with val = "womp"
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
            <summary>All items ({data?.items.length || 0}):</summary>

            {data?.items.map((item) => (
              <div key={item.id}>
                <button
                  onClick={() => {
                    db.transact([tx.items[item.id].delete()]);
                  }}
                >
                  X
                </button>{' '}
                val ={' '}
                {item.val === undefined
                  ? 'undefined'
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
                </button>{' '}
                val ={' '}
                {item.val === undefined
                  ? 'undefined'
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
                </button>{' '}
                val ={' '}
                {item.val === undefined
                  ? 'undefined'
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
                </button>{' '}
                val ={' '}
                {item.val === undefined
                  ? 'undefined'
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
                </button>{' '}
                val ={' '}
                {item.val === undefined
                  ? 'undefined'
                  : JSON.stringify(item.val)}
              </div>
            ))}
          </details>
        </div>
      </div>
    </div>
  );
}

function Page() {
  return <EphemeralAppPage Component={Example} schema={schema} />;
}

export default Page;

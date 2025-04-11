import config from '../../config';
import { init, tx, id } from '@instantdb/react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

function Example({ appId }: { appId: string }) {
  const myConfig = { ...config, appId };
  const db = init(myConfig);

  const { data } = db.useQuery({ items: {} });

  const { data: isNullTrueData } = db.useQuery({
    items: { $: { where: { val: { $isNull: true } } } },
  });

  const { data: isNullFalseData } = db.useQuery({
    items: { $: { where: { val: { $isNull: false } } } },
  });

  const { data: notData } = db.useQuery({
    items: { $: { where: { val: { $not: 'a' } } } },
  });

  const { data: fwdLinkNotData } = db.useQuery({
    items: { $: { where: { 'link.val': { $not: 'a' } } } },
  });

  return (
    <div>
      <div>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({ val: null }))}
        >
          Create item with null val
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({}))}
        >
          Create item with undefined val
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({ val: 'a' }))}
        >
          Create item with val = "a"
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => db.transact(tx.items[id()].update({ val: 'b' }))}
        >
          Create item with val != "a"
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => {
            const linkId = id();
            db.transact([
              tx.link[linkId].update({ val: 'b' }),
              tx.items[id()]
                .update({ val: 'linked-to-b' })
                .link({ link: linkId }),
            ]);
          }}
        >
          Create link with val != "a"
        </button>
        <button
          className="bg-black text-white m-2 p-2"
          onClick={() => {
            const linkId = id();
            db.transact([
              tx.link[linkId].update({ val: 'a' }),
              tx.items[id()]
                .update({ val: 'linked-to-a' })
                .link({ link: linkId }),
            ]);
          }}
        >
          Create link with val = "a"
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
              isNull=true items ({isNullTrueData?.items.length || 0}):
            </summary>

            {isNullTrueData?.items.map((item) => (
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
              isNull=false items ({isNullFalseData?.items.length || 0}):
            </summary>

            {isNullFalseData?.items.map((item) => (
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
            <summary>not val=a items ({notData?.items.length || 0}):</summary>

            {notData?.items.map((item) => (
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
              not link.val=a items ({fwdLinkNotData?.items.length || 0}):
            </summary>

            {fwdLinkNotData?.items.map((item) => (
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
  return <EphemeralAppPage Component={Example} />;
}

export default Page;

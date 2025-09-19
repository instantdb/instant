import { i, init, tx } from '@instantdb/react';
import { useEffect } from 'react';
import config from '../../config';

const schema = i.schema({
  entities: {
    users: i.entity({
      email: i.string().unique().indexed(),
      name: i.string().optional(),
    }),
    inboxes: i.entity({}),
    stickers: i.entity({
      v: i.number(),
      w: i.number(),
      x: i.number(),
      y: i.number(),
      resizable: i.boolean(),
      stretchable: i.boolean(),
    }),
    universes: i.entity({}),
  },
  links: {
    usersInbox: {
      forward: {
        on: 'users',
        has: 'one',
        label: 'inbox',
      },
      reverse: {
        on: 'inboxes',
        has: 'one',
        label: 'user',
        onDelete: 'cascade',
      },
    },
    inboxesStickers: {
      forward: {
        on: 'inboxes',
        has: 'many',
        label: 'stickers',
      },
      reverse: {
        on: 'stickers',
        has: 'one',
        label: 'inbox',
      },
    },
    usersStickers: {
      forward: {
        on: 'users',
        has: 'many',
        label: 'stickers',
      },
      reverse: {
        on: 'stickers',
        has: 'one',
        label: 'creator',
      },
    },
    stickersUsers: {
      forward: {
        on: 'stickers',
        has: 'one',
        label: 'user',
      },
      reverse: {
        on: 'users',
        has: 'many',
        label: 'used_by',
      },
    },
    stickersUniverses: {
      forward: {
        on: 'stickers',
        has: 'one',
        label: 'universes',
      },
      reverse: {
        on: 'universes',
        has: 'many',
        label: 'stickers',
      },
    },
  },
});

const inbox_id = '316f439b-a7be-43ca-9282-4856084a99a3';
const user_id = 'ae1958be-6ed6-40dd-8b5c-9e34f46ad2dd';
const user2_id = 'b05bab83-4c09-4a8f-9e21-49db91539af1';
const universe_id = '2a6da74c-b2b6-45c4-9d29-33712a68f3c8';

const db = init({ ...config, schema });

function Main() {
  useEffect(() => {
    db.transact([
      db.tx.inboxes[inbox_id].update({}),
      db.tx.users[user_id].update({ email: 'niki@tonsky.me', name: 'Niki' }),
      db.tx.users[user2_id].update({ email: 'user@a', name: 'User A' }),
      db.tx.universes[universe_id].update({}),
    ]);
  }, []);

  const { isLoading, error, data } = db.useQuery({
    universes: {
      stickers: {
        inbox: {},
        creator: {},
        user: {},
      },
      $: {
        where: {
          id: universe_id,
        },
      },
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  const stickers = data?.universes[0]?.stickers || [];
  console.log('stickers', stickers);

  const createSticker = () => {
    db.transact(
      db.tx.stickers[crypto.randomUUID()]
        .update({ v: 5, w: 10, x: 15, y: 20 })
        .link({ creator: user_id, user: user2_id, universes: universe_id }),
    );
  };

  const bumpV = (stickerId: string, currentV: number) => {
    const newV = (currentV || 0) + 1;
    console.log('bumpV', newV);
    db.transact(tx.stickers[stickerId].update({ v: newV, w: newV }));
  };

  const bumpVAndSetResizable = (stickerId: string, currentV: number) => {
    const newV = (currentV || 0) + 1;
    console.log('bumpVAndSetResizable', newV);
    db.transact(
      tx.stickers[stickerId].update({
        v: newV,
        w: newV,
        resizable: true,
        stretchable: true,
      }),
    );
  };

  const deleteSticker = (stickerId: string) => {
    db.transact(tx.stickers[stickerId].delete());
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Kosmik Stickers</h1>

      <button
        onClick={createSticker}
        style={{
          marginBottom: '20px',
          padding: '10px',
          border: '1px solid black',
        }}
      >
        Create New Sticker
      </button>

      <h2>Stickers List</h2>
      {stickers.length === 0 ? (
        <p>No stickers yet. Create one!</p>
      ) : (
        <ul>
          {stickers.map((sticker) => (
            <li
              key={sticker.id}
              style={{
                marginBottom: '10px',
                padding: '10px',
                border: '1px solid #ccc',
              }}
            >
              <div>
                <strong>ID:</strong> {sticker.id}
              </div>
              <div>
                <strong>v:</strong> {'' + (sticker.v || 0)}
              </div>
              <div>
                <strong>w:</strong> {'' + (sticker.w || 0)}
              </div>
              <div>
                <strong>resizable:</strong> {'' + sticker.resizable}
              </div>
              <div>
                <strong>stretchable:</strong> {'' + sticker.stretchable}
              </div>
              <div style={{ marginTop: '10px' }}>
                <button
                  onClick={() => bumpV(sticker.id, sticker.v)}
                  style={{
                    marginRight: '10px',
                    padding: '5px 10px',
                    border: '1px solid black',
                  }}
                >
                  Bump v
                </button>
                <button
                  onClick={() => bumpVAndSetResizable(sticker.id, sticker.v)}
                  style={{
                    marginRight: '10px',
                    padding: '5px 10px',
                    border: '1px solid black',
                  }}
                >
                  Bump v + Set Resizable
                </button>
                <button
                  onClick={() => deleteSticker(sticker.id)}
                  style={{
                    padding: '5px 10px',
                    border: '1px solid black',
                    backgroundColor: '#ffcccc',
                  }}
                >
                  Delete Sticker
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function App() {
  return <Main />;
}

export default App;

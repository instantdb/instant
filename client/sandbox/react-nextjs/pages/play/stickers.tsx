/*
 *  Debugging example for query with lots of
 * permission checks
 *
 *
 * When the permission check for view is simply set to `true` the query returns very fast.
 * But when we have a permission check that requires looking up references
 * the query becomes very slow.
 * */
import React, { useEffect, useState } from "react";
import { init, tx, id } from "@instantdb/react";
import Login from "../../components/Login";
import config from "../../config";

const { auth, useAuth, transact, useQuery } = init(config);

function App() {
  const { isLoading, user, error } = useAuth();
  const [universeId, setUniverseId] = useState<string | null>(null);

  // Create a universe for the user if it doesn't exist
  useEffect(() => {
    if (!user) {
      return;
    }
    const getUniverseId = () => window.localStorage.getItem("__universeId");
    if (!getUniverseId()) {
      const _id = id();
      window.localStorage.setItem("__universeId", _id);
      transact([
        tx.users[user.id].update({}).link({ universes: _id }),
        tx.universes[_id].update({}),
      ]);
    }
    setUniverseId(getUniverseId());
  }, [user]);

  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }
  if (user) {
    if (!universeId) {
      return <div>Loading...</div>;
    }
    return <Main universeId={universeId} />;
  }
  return <Login auth={auth} />;
}

function Main({ universeId }: { universeId: string }) {
  const defaultBatchSize = 100;
  const defaultBatchCount = 1;
  const limit = 500;
  const [startTime, setStartTime] = useState(new Date().toISOString());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [batchSize, setBatchSize] = useState(defaultBatchSize);
  const [batchCount, setBatchCount] = useState(defaultBatchCount);
  const q = {
    universes: {
      $: {
        where: { id: universeId },
      },
    },
    stickers: {
      $: {
        where: { "universes.id": universeId },
        limit,
      },
    },
  };
  const { isLoading, error, data } = useQuery(q);

  // Time to load data
  // Note: This will first show optimistic time and then the time from the server
  useEffect(() => {
    if (data || error) {
      const newTime = new Date().toISOString();
      setElapsedTime(
        new Date(newTime).getTime() - new Date(startTime).getTime(),
      );
      setStartTime(newTime);
    }
  }, [data, error, isLoading]);

  const ensureUniverse = async () => {
    await transact(tx.universes[universeId].update({}));
  };

  useEffect(() => {
    ensureUniverse();
  }, []);

  const createStickers = async () => {
    let stickers = [];
    const batches = [];

    const size = 20;
    const total = batchSize * batchCount;
    const created_at = new Date().toISOString();

    for (let i = 0; i < total; i++) {
      const sticker = {
        created_at: created_at,
        type: "shape",
        x: 50 + ((200 * i) % 2000),
        y: 50 + Math.floor((200 * i) / 2000) * size,
        width: size,
        height: size,
      };

      stickers.push(
        tx.stickers[id()].update(sticker).link({ universes: universeId }),
      );

      if (stickers.length >= batchSize) {
        batches.push(stickers);
        stickers = [];
      }
    }

    setStartTime(new Date().toISOString());
    for (const batch of batches) {
      console.log("transacting batch of", batch.length);
      await transact(batch);
    }
  };

  const deleteStickers = async () => {
    setStartTime(new Date().toISOString());
    transact(
      stickers.slice(0, batchSize).map((s: any) => tx.stickers[s.id].delete()),
    );
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Uh oh! {error.message}</div>;
  }

  const { stickers, universes } = data;
  return (
    <div className="flex-col p-4 space-y-4">
      <div>
        <p className="font-bold">useQuery</p>
        <pre>{JSON.stringify(q, null, 2)}</pre>
        <div>Universes: {universes.length}</div>
        <div>
          Stickers: {stickers.length}{" "}
          <span className="text-xs">(limit {limit})</span>
        </div>
        <div>Time to load: {elapsedTime}ms</div>
      </div>
      <div>
        <p className="font-bold">transact</p>
        <div className="flex-col space-y-2">
          <div className="space-x-4">
            <label>Batch Size</label>
            <input
              type="number"
              defaultValue={batchSize}
              onChange={(x) =>
                x.target.value && setBatchSize(parseFloat(x.target.value))
              }
            />
          </div>
          <div className="space-x-4">
            <label>Batch Count</label>
            <input
              type="number"
              defaultValue={batchCount}
              onChange={(x) =>
                x.target.value && setBatchCount(parseFloat(x.target.value))
              }
            />
          </div>
          <div className="space-x-2">
            <button
              className="p-4 border border-black hover:bg-gray-200"
              onClick={createStickers}
            >
              Create stickers
            </button>
            <button
              className="p-4 border border-black hover:bg-gray-200"
              onClick={deleteStickers}
            >
              Delete {batchSize} stickers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

// Pasting the original rules here so I can easily muck around with the
// permissions in the dashboard and then reset them to the original
const originalRules = {
  attrs: {
    allow: {
      create: "true",
      delete: "true",
      update: "true",
    },
  },
  teams: {
    bind: ["isOwner", "auth.id == data.user_id"],
    allow: {
      view: "auth.id != null",
      create: "isOwner",
      delete: "isOwner",
      update: "isOwner",
    },
  },
  users: {
    bind: [
      "isOwner",
      "auth.id == data.id",
      "isPartOfUniverse",
      "auth.id in data.ref('universes.users.id')",
    ],
    allow: {
      view: "auth.id != null",
      create: "isOwner",
      delete: "isOwner",
      update: "isOwner",
    },
  },
  stickers: {
    bind: ["isUniverseOwner", "auth.id in data.ref('universes.users.id')"],
    allow: {
      view: "isUniverseOwner", // setting this to true makes the queries very fast
      create: "isUniverseOwner",
      delete: "isUniverseOwner",
      update: "isUniverseOwner",
    },
  },
  universes: {
    bind: ["isOwner", "auth.id in data.ref('users.id')"],
    allow: {
      view: "isOwner",
      create: "isOwner",
      delete: "isOwner",
      update: "isOwner",
    },
  },
  universe_invite: {
    bind: [
      "isSender",
      "auth.id in data.ref('sender.id')",
      "isReceiver",
      "auth.id in data.ref('receiver.id')",
    ],
    allow: {
      view: "isSender || isReceiver",
      create: "isSender",
      delete: "isSender || isReceiver",
      update: "isSender",
    },
  },
};

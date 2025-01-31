/*
 * Tile Game!
 * This example is meant to mimic a simple collaborative game. We use a 4x4 grid
 * that users can color. We use `merge` to update a slice of data without
 * overwriting potential changes from other clients.
 * */

import config from '@/lib/config'; // hide-line
import { init } from '@instantdb/react';
import { useEffect, useState } from 'react';

const db = init({
  ...config, // hide-line
  appId: __getAppId(),
});

const room = db.room('main');

export default function App() {
  const [hoveredSquare, setHoveredSquare] = useState(null as string | null);
  const [myColor, setMyColor] = useState(null as string | null);
  const { isLoading, error, data } = db.useQuery({ boards: {} });
  const {
    user: myPresence,
    peers,
    publishPresence,
    isLoading: isPresenceLoading,
  } = db.rooms.usePresence(room);

  const boardState = data?.boards.find((b) => b.id === boardId)?.state;

  useEffect(() => {
    if (isLoading || isPresenceLoading) return;
    if (error) return;

    // If the board doesn't exist, create it
    if (!boardState) {
      db.transact([
        db.tx.boards[boardId].update({
          state: makeEmptyBoard(),
        }),
      ]);
    }

    // If I don't have a color, generate one and publish it
    // make sure to not choose a color that a peer has already chosen
    if (!myColor) {
      const takenColors = new Set(Object.values(peers).map((p) => p.color));
      const availableColors = colors.filter((c) => !takenColors.has(c));
      const color =
        availableColors[Math.floor(Math.random() * availableColors.length)] ||
        defaultColor;
      setMyColor(color);
      publishPresence({ color });
    }
  }, [isLoading, isPresenceLoading, error, myColor]);

  if (!boardState || isLoading || isPresenceLoading)
    return <div>Loading...</div>;

  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="flex-none p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="flex-col">
          <div className="flex items-center gap-2">
            Me:
            <div
              className="flex w-8 h-8 rounded-full border border-black"
              style={{ backgroundColor: myPresence?.color }}
            ></div>
          </div>
          <div className="flex items-center gap-2">
            Others:
            {Object.entries(peers).map(([peerId, presence]) => (
              <div
                key={peerId}
                className="flex w-8 h-8 rounded-full border border-black"
                style={{ backgroundColor: presence.color }}
              ></div>
            ))}
          </div>
        </div>
        <div className="board">
          {Array.from({ length: boardSize }).map((row, r) => (
            <div key={`row-${r}`} className="flex">
              {Array.from({ length: boardSize }).map((sq, c) => (
                <div
                  key={`idx-${r}-${c}`}
                  className={`flex justify-center w-12 h-12 text-lg hover:cursor-pointer hover:bg-gray-300 outline outline-black`}
                  style={{
                    backgroundColor:
                      hoveredSquare === `${r}-${c}`
                        ? (myColor ?? undefined)
                        : boardState[`${r}-${c}`],
                  }}
                  onMouseEnter={() => setHoveredSquare(`${r}-${c}`)}
                  onMouseLeave={() => setHoveredSquare(null)}
                  onClick={() => {
                    db.transact([
                      db.tx.boards[boardId].merge({
                        state: {
                          [`${r}-${c}`]: myColor,
                        },
                      }),
                    ]);
                  }}
                ></div>
              ))}
            </div>
          ))}
        </div>
        <button
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded my-4"
          onClick={() => {
            db.transact([
              db.tx.boards[boardId].update({
                state: makeEmptyBoard(),
              }),
            ]);
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

const boardSize = 4;
const whiteColor = '#ffffff';
const defaultColor = whiteColor;
const colors = [
  '#ff0000', // Red
  '#00ff00', // Green
  '#0000ff', // Blue
  '#ffff00', // Yellow
  '#ff00ff', // Purple
  '#ffa500', // Orange
];
// singleton ID
const boardId = '83c059e2-ed47-42e5-bdd9-6de88d26c521';

function makeEmptyBoard() {
  const emptyBoard: Record<string, string> = {};
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      emptyBoard[`${r}-${c}`] = whiteColor;
    }
  }

  return emptyBoard;
}

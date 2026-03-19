/*
 * Tile Game!
 * A collaborative pixel art board. We use `merge` to update a slice of
 * data without overwriting changes from other clients.
 */

import { id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useEffect, useRef, useState } from 'react';

export default function App() {
  const db = useRecipeDB();
  const room = db.room('main');
  const userIdRef = useRef(id());
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

    if (!boardState) {
      db.transact([db.tx.boards[boardId].update({ state: makeEmptyBoard() })]);
    }

    if (!myColor) {
      const takenColors = new Set(Object.values(peers).map((p) => p.color));
      const available = colors.filter((c) => !takenColors.has(c));
      const color =
        available[Math.floor(Math.random() * available.length)] || colors[0];
      setMyColor(color);
      publishPresence({ color, id: userIdRef.current });
    }
  }, [isLoading, isPresenceLoading, error, myColor]);

  if (!boardState || isLoading || isPresenceLoading)
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Loading...
      </div>
    );

  if (error)
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-400">
        Error: {error.message}
      </div>
    );

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white p-4">
      {/* Header */}
      <div className="flex w-full max-w-[200px] items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: myColor ?? '#ddd' }}
          />
          <span className="text-xs text-gray-500">Your color</span>
        </div>
        <button
          className="text-xs text-gray-400 hover:text-gray-600"
          onClick={() => {
            db.transact([
              db.tx.boards[boardId].update({ state: makeEmptyBoard() }),
            ]);
          }}
        >
          Reset
        </button>
      </div>

      {/* Board */}
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-gray-200 bg-gray-100 p-2 shadow-sm">
        {Array.from({ length: boardSize }).map((_, r) =>
          Array.from({ length: boardSize }).map((_, c) => {
            const key = `${r}-${c}`;
            const isHovered = hoveredSquare === key;
            return (
              <div
                key={key}
                className="h-11 w-11 cursor-pointer rounded-lg transition-colors"
                style={{
                  backgroundColor: isHovered
                    ? '#e8e5e0'
                    : boardState[key] || emptyColor,
                }}
                onMouseEnter={() => setHoveredSquare(key)}
                onMouseLeave={() => setHoveredSquare(null)}
                onClick={() => {
                  db.transact([
                    db.tx.boards[boardId].merge({
                      state: { [key]: myColor },
                    }),
                  ]);
                }}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}

const boardSize = 4;
const emptyColor = '#f5f3f0';

const colors = [
  '#e76f51', // warm red
  '#2a9d8f', // teal
  '#e9c46a', // amber
  '#264653', // dark teal
  '#f4a261', // orange
  '#d4a0d0', // lavender
];

const boardId = '83c059e2-ed47-42e5-bdd9-6de88d26c521';

function makeEmptyBoard() {
  const board: Record<string, string> = {};
  for (let r = 0; r < boardSize; r++)
    for (let c = 0; c < boardSize; c++) board[`${r}-${c}`] = emptyColor;
  return board;
}

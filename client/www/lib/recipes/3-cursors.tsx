import { Cursors } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

export default function InstantCursors() {
  const db = useRecipeDB();
  const room = db.room('cursors-example', '123');
  const color = useRef(randomDarkColor()).current;
  return (
    <Cursors
      room={room}
      userCursorColor={color}
      className={cursorsClassNames}
    >
      <span className="text-sm text-gray-400 italic">
        Move your cursor around!
      </span>
    </Cursors>
  );
}

function randomDarkColor() {
  return (
    '#' +
    [0, 0, 0]
      .map(() =>
        Math.floor(Math.random() * 200)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

const cursorsClassNames = [
  'flex h-full w-full items-center justify-center overflow-hidden touch-none',
  'bg-white',
  'bg-[radial-gradient(circle,#e0ddd5_1px,transparent_1px)]',
  'bg-[length:24px_24px]',
].join(' ');

import { Cursors } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

export default function InstantCursors() {
  const db = useRecipeDB();
  const room = db.room('cursors-example', '123');
  const colorRef = useRef(randomDarkColor());
  return (
    <Cursors
      room={room}
      userCursorColor={colorRef.current}
      className={cursorsClassNames}
    >
      Move your cursor around! ✨
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

const cursorsClassNames =
  'flex h-full w-full items-center justify-center overflow-hidden font-mono text-sm text-gray-800 touch-none'; // hide-line
// show: const cursorsClassNames =
// show:   'flex h-screen w-screen items-center justify-center overflow-hidden font-mono text-sm text-gray-800 touch-none';

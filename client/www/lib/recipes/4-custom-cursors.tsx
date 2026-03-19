import { Cursors, id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

function CustomCursor({ name }: { color?: string; name: string }) {
  return (
    <img
      src={`/api/avatar?name=${encodeURIComponent(name)}&size=32`}
      alt={name}
      className="h-8 w-8"
    />
  );
}

export default function InstantCursors() {
  const db = useRecipeDB();
  const room = db.room('cursors-example', '124');
  const userIdRef = useRef(id());
  const colorRef = useRef(randomDarkColor());

  db.rooms.useSyncPresence(room, {
    name: userIdRef.current,
  });

  return (
    <Cursors
      room={room}
      renderCursor={(props) => (
        <CustomCursor color={props.color} name={props.presence.name} />
      )}
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
  'flex h-full w-full items-center justify-center overflow-hidden font-mono text-sm text-gray-800';

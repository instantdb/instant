import { Cursors, id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

function CustomCursor({ name }: { color?: string; name: string }) {
  return (
    <img
      src={`/api/avatar?name=${encodeURIComponent(name)}&size=40`}
      alt={name}
      className="h-10 w-10 drop-shadow-md"
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
      <span className="text-sm text-gray-400">
        You can customize your cursors too!
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
  'flex h-full w-full items-center justify-center overflow-hidden',
  'bg-white',
  'bg-[radial-gradient(circle,#e0ddd5_1px,transparent_1px)]',
  'bg-[length:24px_24px]',
].join(' ');

import { Cursors, id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

function CustomCursor({ name }: { name: string }) {
  return (
    <img
      src={`/api/avatar?name=${encodeURIComponent(name)}&size=40`}
      width={40}
      height={40}
      loading="eager"
      decoding="async"
      alt=""
      className="h-10 w-10"
    />
  );
}

export default function InstantCursors() {
  const db = useRecipeDB();
  const room = db.room('cursors-example', '124');
  const userId = useRef(id()).current;
  const colorRef = useRef(randomDarkColor());

  db.rooms.useSyncPresence(room, {
    name: userId,
  });

  return (
    <Cursors
      room={room}
      renderCursor={(props) => (
        <CustomCursor name={props.presence.name} />
      )}
      userCursorColor={colorRef.current}
      className={cursorsClassNames}
    >
      <span className="text-sm text-gray-400 italic">
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

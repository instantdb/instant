import config from '@/lib/config'; // hide-line
import { Cursors, init } from '@instantdb/react';

const db = init({
  ...config, // hide-line
  appId: __getAppId(),
});

const room = db.room('cursors-example', '124');

function CustomCursor({ color, name }: { color?: string; name: string }) {
  return (
    <span
      className="rounded-b-xl rounded-r-xl border-2 bg-white/30 px-3 text-xs shadow-lg backdrop-blur-md"
      style={{
        borderColor: color ?? 'gray',
      }}
    >
      {name}
    </span>
  );
}

export default function InstantCursors() {
  room.useSyncPresence({
    name: userId,
  });

  return (
    <Cursors
      room={room}
      renderCursor={(props) => (
        <CustomCursor color={props.color} name={props.presence.name} />
      )}
      userCursorColor={randomDarkColor}
      className={cursorsClassNames}
    >
      Move your cursor around! ✨
    </Cursors>
  );
}

const userId = Math.random().toString(36).slice(2, 6);

const randomDarkColor =
  '#' +
  [0, 0, 0]
    .map(() =>
      Math.floor(Math.random() * 200)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

const cursorsClassNames =
  'flex h-screen w-screen items-center justify-center overflow-hidden font-mono text-sm text-gray-800';

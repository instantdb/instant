import config from '@/lib/config'; // hide-line
import { Cursors, init } from '@instantdb/react';

const db = init({
  ...config, // hide-line
  appId: __getAppId(),
});

const room = db.room('cursors-example', '123');

export default function InstantCursors() {
  return (
    <Cursors
      room={room}
      userCursorColor={randomDarkColor}
      className={cursorsClassNames}
    >
      Move your cursor around! ✨
    </Cursors>
  );
}

const randomDarkColor = '#' + [0, 0, 0].map(() => Math.floor(Math.random() * 200).toString(16).padStart(2, '0')).join('');

const cursorsClassNames =
  'flex h-screen w-screen items-center justify-center overflow-hidden font-mono text-sm text-gray-800 touch-none';

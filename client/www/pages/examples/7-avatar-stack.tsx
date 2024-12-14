import config from '@/lib/config'; // hide-line
import { init } from '@instantdb/react';

const db = init({
  ...config, // hide-line
  appId: __getAppId(),
});

const room = db.room('avatars-example', 'avatars-example-1234');

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

export default function InstantAvatarStack() {
  const presence = room.usePresence({
    user: true,
  });

  room.useSyncPresence({
    name: userId,
    color: randomDarkColor,
  });

  return (
    <div className="flex h-screen justify-center items-center">
      {presence.user ? (
        <Avatar
          key={'user'}
          name={presence.user.name}
          color={presence.user.color}
        />
      ) : null}
      {Object.entries(presence.peers).map(([id, peer]) => (
        <Avatar key={id} name={peer.name} color={peer.color} />
      ))}
    </div>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <div
      key={'user'}
      className={avatarClassNames}
      style={{
        borderColor: color,
      }}
    >
      {name?.slice(0, 1)}
      <div className="hidden group-hover:flex absolute z-10 bottom-10 text-sm text-gray-800 bg-gray-200 rounded px-2">
        {name}
      </div>
    </div>
  );
}

const avatarClassNames =
  'group relative select-none h-10 w-10 bg-gray-50 border border-4 border-black user-select rounded-full first:ml-0 flex justify-center items-center -ml-2 first:ml-0 relative';

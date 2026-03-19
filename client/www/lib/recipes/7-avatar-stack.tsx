import { useRecipeDB } from './db';
import { useState } from 'react';

export default function InstantAvatarStack() {
  const db = useRecipeDB();
  const room = db.room('avatars-example', 'avatars-example-1234');
  const [{ userId, randomDarkColor }] = useState(() => {
    const uid = Math.random().toString(36).slice(2, 6);
    const color =
      '#' +
      [0, 0, 0]
        .map(() =>
          Math.floor(Math.random() * 200)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    return { userId: uid, randomDarkColor: color };
  });
  const presence = room.usePresence({
    user: true,
  });

  db.rooms.useSyncPresence(room, {
    name: userId,
    color: randomDarkColor,
  });

  return (
    <div className="flex h-full items-center justify-center">
      {/* show:     <div className="flex h-screen items-center justify-center"> */}
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
      <img
        src={`https://instantdb.com/api/avatar?name=${encodeURIComponent(name)}&size=32`}
        alt={name}
        className="h-full w-full rounded-full"
      />
      <div className="absolute bottom-10 z-10 hidden rounded-sm bg-gray-200 px-2 text-sm text-gray-800 group-hover:flex">
        {name}
      </div>
    </div>
  );
}

const avatarClassNames =
  'group relative select-none h-10 w-10 bg-gray-50 border border-4 border-black user-select rounded-full first:ml-0 flex justify-center items-center -ml-2 first:ml-0 relative';

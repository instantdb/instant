import { id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

export default function InstantAvatarStack() {
  const db = useRecipeDB();
  const room = db.room('avatars-example', 'avatars-example-1234');
  const userIdRef = useRef(id());

  const presence = room.usePresence({
    user: true,
  });

  db.rooms.useSyncPresence(room, {
    name: userIdRef.current.slice(0, 6),
  });

  return (
    <div className="flex h-full items-center justify-center">
      {presence.user ? (
        <Avatar key={'user'} name={presence.user.name} />
      ) : null}
      {Object.entries(presence.peers).map(([peerId, peer]) => (
        <Avatar key={peerId} name={peer.name} />
      ))}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <div className={avatarClassNames}>
      <img
        src={`/api/avatar?name=${encodeURIComponent(name)}&size=32`}
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
  'group relative select-none h-10 w-10 bg-gray-50 border border-4 border-black rounded-full first:ml-0 flex justify-center items-center -ml-2 first:ml-0 relative';

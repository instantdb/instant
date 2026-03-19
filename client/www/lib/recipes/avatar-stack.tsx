import { id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

export default function InstantAvatarStack() {
  const db = useRecipeDB();
  const room = db.room('avatars-example', 'avatars-example-1234');
  const userId = useRef(id()).current;

  const presence = room.usePresence({ user: true });
  db.rooms.useSyncPresence(room, { name: userId.slice(0, 6) });

  const peerCount = Object.keys(presence.peers).length;

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
          Online — {peerCount + 1}
        </div>
        {presence.user ? <AvatarRow name={presence.user.name} /> : null}
        {Object.entries(presence.peers).map(([peerId, peer]) => (
          <AvatarRow key={peerId} name={peer.name} />
        ))}
        <p className="mt-1 text-xs text-gray-400 italic">
          Add more previews to see more avatars!
        </p>
      </div>
    </div>
  );
}

function AvatarRow({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <img
          src={`https://instantdb.com/api/avatar?name=${encodeURIComponent(name)}&size=32`}
          alt={name}
          className="h-8 w-8 rounded-full"
        />
        <div className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
      </div>
      <span className="text-sm font-medium text-gray-700">{name}</span>
    </div>
  );
}

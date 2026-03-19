import { id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

export default function InstantAvatarStack() {
  const db = useRecipeDB();
  const room = db.room('avatars-example', 'avatars-example-1234');
  const userIdRef = useRef(id());

  const presence = room.usePresence({ user: true });
  db.rooms.useSyncPresence(room, { name: userIdRef.current.slice(0, 6) });

  const everyone = [
    ...(presence.user ? [{ key: 'user', name: presence.user.name }] : []),
    ...Object.entries(presence.peers).map(([k, v]) => ({
      key: k,
      name: v.name,
    })),
  ];

  return (
    <div className="flex h-full items-center justify-center px-4">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
          Online — {everyone.length}
        </div>
        {everyone.map((person) => (
          <div key={person.key} className="flex items-center gap-2.5">
            <div className="relative">
              <img
                src={`/api/avatar?name=${encodeURIComponent(person.name)}&size=32`}
                alt={person.name}
                className="h-8 w-8 rounded-full"
              />
              <div className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
            </div>
            <span className="text-sm font-medium text-gray-700">
              {person.name}
            </span>
          </div>
        ))}
        <p className="mt-1 text-xs text-gray-400 italic">
          Add more previews to see more avatars!
        </p>
      </div>
    </div>
  );
}

import { id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

export default function InstantTypingIndicator() {
  const db = useRecipeDB();
  const room = db.room('typing-indicator-example', '1234');
  const userIdRef = useRef(id());
  db.rooms.useSyncPresence(room, { id: userIdRef.current });

  const presence = db.rooms.usePresence(room);
  const { active, inputProps } = db.rooms.useTypingIndicator(
    room,
    'chat-input',
  );

  const peers = Object.values(presence.peers).filter((p) => p.id);
  const activeMap = Object.fromEntries(active.map((p) => [p.id, true]));

  return (
    <div className="flex h-full">
      <div className="flex w-12 flex-col items-center gap-2 border-r border-gray-100 py-3">
        {peers.map((peer) => (
          <div key={peer.id} className="relative">
            <img
              src={`/api/avatar?name=${encodeURIComponent(peer.id || '')}&size=32`}
              alt=""
              className="h-8 w-8 rounded-full"
            />
            {activeMap[peer.id] ? (
              <div className="absolute -right-1 bottom-0 rounded-xs bg-black px-1 text-[10px] leading-3 text-white">
                ⋯
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-400 italic">
            Start typing to see the indicator!
          </p>
        </div>
        <div className="px-3 pt-1 pb-3">
          <div className="truncate text-xs text-gray-500">
            {active.length ? typingInfo(active) : <>&nbsp;</>}
          </div>
          <textarea
            placeholder="Write a message..."
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
            rows={1}
            onKeyDown={(e) => inputProps.onKeyDown(e)}
            onBlur={() => inputProps.onBlur()}
          />
        </div>
      </div>
    </div>
  );
}

function typingInfo(active: unknown[]) {
  if (active.length === 1) return '1 person is typing...';
  return `${active.length} people are typing...`;
}

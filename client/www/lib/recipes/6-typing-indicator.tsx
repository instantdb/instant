import { id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

export default function InstantTypingIndicator() {
  const db = useRecipeDB();
  const room = db.room('typing-indicator-example', '1234');
  const userIdRef = useRef(id());
  db.rooms.useSyncPresence(room, {
    id: userIdRef.current,
  });

  const presence = db.rooms.usePresence(room);

  const { active, inputProps } = db.rooms.useTypingIndicator(
    room,
    'chat-input',
  );

  const peers = Object.values(presence.peers).filter((p) => p.id);
  const activeMap = Object.fromEntries(
    active.map((activePeer) => [activePeer.id, activePeer]),
  );

  return (
    <div className="flex h-full gap-3 p-2">
      <div className="flex w-10 flex-col gap-2" key="side">
        {peers.map((peer) => {
          return (
            <div
              key={peer.id}
              className="relative inset-0 flex h-10 w-10 items-center justify-center"
            >
              <img
                src={`/api/avatar?name=${encodeURIComponent(peer.id || '')}&size=32`}
                alt=""
                className="h-full w-full rounded-full"
              />
              {activeMap[peer.id] ? (
                <div className="absolute -right-1 bottom-0 rounded-xs bg-black px-1 leading-3 text-white shadow-sm">
                  ⋯
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div key="main" className="flex flex-1 flex-col justify-end">
        <div className="truncate text-xs text-gray-500">
          {active.length ? typingInfo(active) : <>&nbsp;</>}
        </div>
        <textarea
          placeholder="Compose your message here..."
          className="w-full rounded-md border-gray-300 p-2 text-sm"
          onKeyDown={(e) => inputProps.onKeyDown(e)}
          onBlur={() => inputProps.onBlur()}
        />
      </div>
    </div>
  );
}

function typingInfo(active: unknown[]) {
  if (active.length === 1) return '1 person is typing...';
  return `${active.length} people are typing...`;
}

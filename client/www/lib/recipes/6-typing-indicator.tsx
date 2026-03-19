import { id } from '@instantdb/react';
import { useRecipeDB } from './db';
import { useRef } from 'react';

export default function InstantTypingIndicator() {
  const db = useRecipeDB();
  const room = db.room('typing-indicator-example', '1234');
  const userIdRef = useRef(id());
  const user = {
    id: userIdRef.current,
    name: userIdRef.current.slice(0, 6),
  };
  db.rooms.useSyncPresence(room, user);

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
              className="relative inset-0 flex h-10 w-10 items-center justify-center overflow-hidden rounded-full"
            >
              <img
                src={`https://instantdb.com/api/avatar?name=${encodeURIComponent(peer.name || '')}&size=32`}
                alt={peer.name || ''}
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
        <textarea
          placeholder="Compose your message here..."
          className="w-full rounded-md border-gray-300 p-2 text-sm"
          onKeyDown={(e) => inputProps.onKeyDown(e)}
          onBlur={() => inputProps.onBlur()}
        />
        <div className="truncate text-xs text-gray-500">
          {active.length ? typingInfo(active) : <>&nbsp;</>}
        </div>
      </div>
    </div>
  );
}

function typingInfo(typing: { name: string }[]) {
  if (typing.length === 0) return null;
  if (typing.length === 1) return `${typing[0].name} is typing...`;
  if (typing.length === 2)
    return `${typing[0].name} and ${typing[1].name} are typing...`;

  return `${typing[0].name} and ${typing.length - 1} others are typing...`;
}

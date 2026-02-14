import { type Component, For, createMemo } from "solid-js";
import { db, chatRoom } from "../lib/db";

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function pickColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

const PresenceBar: Component = () => {
  const user = db.useUser();
  const nickname = createMemo(() => user().email?.split("@")[0] ?? "anon");
  const color = createMemo(() => pickColor(user().email ?? ""));

  db.rooms.useSyncPresence(chatRoom, {
    nickname: nickname(),
    color: color(),
  });

  const presence = db.rooms.usePresence(chatRoom, {
    keys: ["nickname", "color"],
  });

  const peers = createMemo(() => {
    const p = presence().peers;
    return Object.entries(p ?? {}).map(([id, data]) => ({
      id,
      ...data,
    }));
  });

  return (
    <div class="bg-white rounded-lg shadow p-3">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-sm text-gray-500">Online:</span>

        {/* Current user */}
        <span
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-medium"
          style={{ "background-color": color() }}
        >
          {nickname()} (you)
        </span>

        {/* Peers */}
        <For each={peers()}>
          {(peer) => (
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-medium"
              style={{ "background-color": peer.color || "#6b7280" }}
            >
              {peer.nickname || "anon"}
            </span>
          )}
        </For>

        {presence().isLoading && (
          <span class="text-gray-400 text-xs">loading...</span>
        )}
      </div>
    </div>
  );
};

export default PresenceBar;

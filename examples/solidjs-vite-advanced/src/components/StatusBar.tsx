import { type Component, createSignal } from "solid-js";
import { db } from "../lib/db";

const statusColors: Record<string, string> = {
  connecting: "bg-yellow-400",
  opened: "bg-blue-400",
  authenticated: "bg-green-400",
  closed: "bg-gray-400",
  errored: "bg-red-400",
};

const StatusBar: Component = () => {
  const status = db.useConnectionStatus();
  const deviceId = db.useLocalId("device");
  const [asyncDeviceId, setAsyncDeviceId] = createSignal("");
  const [asyncAuth, setAsyncAuth] = createSignal("");

  const handleGetLocalId = async () => {
    const result = await db.getLocalId("device");
    setAsyncDeviceId(result);
  };

  const handleGetAuth = async () => {
    const user = await db.getAuth();
    setAsyncAuth(
      user ? (user.email ?? "authenticated (no email)") : "not logged in",
    );
  };

  return (
    <div class="bg-white rounded-lg shadow p-3 flex flex-wrap items-center gap-3 text-sm">
      <div class="flex items-center gap-1.5">
        <span
          class={`inline-block w-2.5 h-2.5 rounded-full ${statusColors[status()] ?? "bg-gray-300"}`}
        />
        <span class="text-gray-600">{status()}</span>
      </div>

      <span class="text-gray-300">|</span>

      <span class="text-gray-500 truncate max-w-48" title={deviceId() ?? ""}>
        Device: {deviceId() ?? "loading..."}
      </span>

      <span class="text-gray-300">|</span>

      <button
        class="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-xs transition-colors"
        onClick={handleGetLocalId}
      >
        getLocalId()
      </button>
      {asyncDeviceId() && (
        <span class="text-gray-400 text-xs truncate max-w-32">
          {asyncDeviceId()}
        </span>
      )}

      <button
        class="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-xs transition-colors"
        onClick={handleGetAuth}
      >
        getAuth()
      </button>
      {asyncAuth() && <span class="text-gray-400 text-xs">{asyncAuth()}</span>}
    </div>
  );
};

export default StatusBar;

import { i, InstantReactAbstractDatabase } from '@instantdb/react';
import { useMemo, useState } from 'react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {},
  rooms: {
    'topic-stale-demo': {
      presence: i.entity({
        label: i.string(),
      }),
      topics: {
        shout: i.entity({
          message: i.string(),
        }),
      },
    },
  },
});

type Schema = typeof schema;

const ROOM_TYPE = 'topic-stale-demo';
const ROOM_ID = 'shared-room';
const TOPIC = 'shout';

function TopicEffectStalenessDemo({
  db,
  appId,
}: {
  db: InstantReactAbstractDatabase<Schema>;
  appId: string;
}) {
  const room = useMemo(() => db.room(ROOM_TYPE, ROOM_ID), [db]);
  const [label, setLabel] = useState('alpha');
  const [message, setMessage] = useState('ping');
  const [hookLog, setHookLog] = useState<string[]>([]);

  const publish = db.rooms.usePublishTopic(room, TOPIC);
  db.rooms.useSyncPresence(room, { label });

  db.rooms.useTopicEffect(room, TOPIC, (payload) => {
    setHookLog((prev) => [
      JSON.stringify({ label, payload }, null, 2),
      ...prev,
    ]);
  });

  const sendMessage = () => {
    if (!message.trim()) return;
    publish({ message });
  };

  const clearLogs = () => {
    setHookLog([]);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-gray-500">
          <div>Ephemeral app</div>
          <div className="font-mono text-sm">{appId}</div>
        </div>
        <ResetButton className="text-xs underline" label="New app" />
      </div>

      <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
        <div className="text-sm font-medium">Send a topic message</div>
        <div className="flex flex-wrap gap-2 text-sm">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 min-w-[140px] rounded border px-2 py-1"
            placeholder="message"
          />
          <button
            className="rounded bg-black px-3 py-1 text-white"
            onClick={sendMessage}
          >
            publish
          </button>
          <button
            className="rounded border border-gray-300 px-3 py-1"
            onClick={clearLogs}
          >
            clear
          </button>
        </div>
        <p className="text-xs text-gray-600">
          We do not send any label in the payload. The handler below just reads
          local state.
        </p>
      </div>

      <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium">
            useTopicEffect handler (reads label from state)
          </div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 min-w-[140px] rounded border px-2 py-1 text-sm"
            placeholder="handler label (not sent)"
          />
        </div>
        <p className="text-xs text-gray-600">
          Change the label, then publish again. With the stale handler bug, the
          log keeps the original label; with the fix, it tracks the latest
          value.
        </p>
        <LogPanel
          title="Handler log"
          entries={hookLog}
          emptyCopy="Publish to see what the handler sees."
        />
      </div>
    </div>
  );
}

function LogPanel({
  title,
  entries,
  emptyCopy,
}: {
  title: string;
  entries: string[];
  emptyCopy: string;
}) {
  return (
    <div className="space-y-3 rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        <span className="text-xs text-gray-500">{entries.length} events</span>
      </div>
      {!entries.length ? (
        <p className="text-sm text-gray-600">{emptyCopy}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {entries.map((entry, idx) => (
            <li
              key={`${entry}-${idx}`}
              className="rounded border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs"
            >
              {entry}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <EphemeralAppPage schema={schema} Component={TopicEffectStalenessDemo} />
  );
}

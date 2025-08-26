import { i, id, InstantReactAbstractDatabase } from '@instantdb/react';
import { useEffect, useState } from 'react';
import EphemeralAppPage, {
  ResetButton,
} from '../../components/EphemeralAppPage';

const schema = i.schema({
  entities: {
    chats: i.entity({
      title: i.string(),
      updatedAt: i.number().indexed(),
    }),
    messages: i.entity({
      text: i.string(),
      chatId: i.string(),
      createdAt: i.number(),
    }),
  },
  links: {
    chatMessages: {
      forward: { on: 'chats', has: 'many', label: 'messages' },
      reverse: { on: 'messages', has: 'one', label: 'chat' },
    },
  },
});

type Schema = typeof schema;

const perms = {
  chats: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
    },
  },
  messages: {
    allow: {
      view: 'true',
      create: 'true',
      update: 'true',
      delete: 'true',
    },
  },
};

interface AppProps {
  db: InstantReactAbstractDatabase<Schema>;
  appId: string;
}

function App({ db }: AppProps) {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');

  const { data, isLoading } = db.useQuery({
    chats: {
      $: { order: { updatedAt: 'desc' } },
      messages: {},
    },
  });

  // Initialize chats if not present
  useEffect(() => {
    if (data?.chats?.length || isLoading) return;
    const now = Date.now();
    db.transact([
      db.tx.chats[id()].update({
        title: 'General Chat',
        updatedAt: now - 3000,
      }),
      db.tx.chats[id()].update({
        title: 'Random Topics',
        updatedAt: now - 2000,
      }),
      db.tx.chats[id()].update({
        title: 'Important Discussion',
        updatedAt: now - 1000,
      }),
    ]);
  }, [data, isLoading, db]);

  // Auto-select first chat if none selected
  useEffect(() => {
    if (!selectedChatId && data?.chats?.length) {
      setSelectedChatId(data.chats[0].id);
    }
  }, [data?.chats, selectedChatId]);

  const selectedChat = data?.chats?.find((c) => c.id === selectedChatId);
  const messages = selectedChat?.messages || [];
  const sortedMessages = [...messages].sort(
    (a, b) => (a.createdAt || 0) - (b.createdAt || 0),
  );

  const sendMessage = () => {
    if (!messageInput.trim() || !selectedChatId) return;

    const now = Date.now();
    const messageId = id();

    // This transaction updates the chat's updatedAt and creates a new message
    // The flicker happens because the chat temporarily moves in the list
    db.transact([
      db.tx.chats[selectedChatId].update({ updatedAt: now }),
      db.tx.messages[messageId].update({
        text: messageInput,
        chatId: selectedChatId,
        createdAt: now,
      }),
      db.tx.chats[selectedChatId].link({ messages: messageId }),
    ]);

    setMessageInput('');
  };
  if (isLoading) {
    return (
      <div className="flex h-96 border rounded-lg overflow-hidden bg-blue-500"></div>
    );
  }

  if (!data?.chats) return null;

  return (
    <div className="flex h-96 border rounded-lg overflow-hidden">
      {/* Chat list on the left */}
      <div className="w-1/3 bg-gray-50 border-r">
        <div className="p-4 border-b bg-white">
          <h3 className="font-semibold">Chats (ordered by updatedAt desc)</h3>
          <ResetButton className="text-sm bg-red-500 text-white px-2 py-1 rounded mt-2" />
        </div>
        <div className="overflow-y-auto">
          {data.chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setSelectedChatId(chat.id)}
              className={`p-4 border-b cursor-pointer hover:bg-gray-100 ${
                chat.id === selectedChatId
                  ? 'bg-blue-50 border-l-4 border-l-blue-500'
                  : ''
              }`}
            >
              <div className="font-medium">{chat.title}</div>
              <div className="text-xs text-gray-500 mt-1">
                Updated: {new Date(chat.updatedAt || 0).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Messages on the right */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b bg-white">
          <h3 className="font-semibold">
            {selectedChat?.title || 'Select a chat'}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sortedMessages.map((msg) => (
            <div key={msg.id} className="bg-gray-100 rounded-lg p-3">
              <div>{msg.text}</div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(msg.createdAt || 0).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {sortedMessages.length === 0 && (
            <div className="text-gray-500 text-center mt-8">
              No messages yet. Send one below!
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendMessage}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <div className="max-w-4xl flex flex-col mt-20 mx-auto">
      <h1 className="text-2xl font-bold text-center mb-4">
        Chat Flicker Repro
      </h1>
      <p className="text-center mb-4 text-gray-600">
        Send messages to see the chat flicker as it temporarily reorders when
        updatedAt is updated.
      </p>
      <p className="text-center mb-8 text-gray-500 text-sm">
        Watch the chat list on the left - when you send a message, the selected
        chat will briefly move.
      </p>
      <EphemeralAppPage schema={schema} perms={perms} Component={App} />
    </div>
  );
}

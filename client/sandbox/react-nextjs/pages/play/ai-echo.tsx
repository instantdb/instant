import { useChat, type UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { init as initAdmin } from '@instantdb/admin';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import config from '../../config';
import EphemeralAppPage from '../../components/EphemeralAppPage';

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 text-gray-400">
      <span
        className="animate-bounce text-lg"
        style={{ animationDelay: '0ms' }}
      >
        •
      </span>
      <span
        className="animate-bounce text-lg"
        style={{ animationDelay: '150ms' }}
      >
        •
      </span>
      <span
        className="animate-bounce text-lg"
        style={{ animationDelay: '300ms' }}
      >
        •
      </span>
      <span className="ml-2 text-sm">typing</span>
    </div>
  );
}

function makeChatId() {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeStorageKeys(prefix: string) {
  return {
    chatId: `${prefix}-chat-id`,
    messages: `${prefix}-messages`,
  };
}

function saveMessages(key: string, messages: UIMessage[]) {
  localStorage.setItem(key, JSON.stringify(messages));
}

function getStoredMessages(key: string): UIMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function useChatId(prefix: string) {
  const keys = makeStorageKeys(prefix);
  const [chatId, setChatId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(keys.chatId);
    if (stored) {
      setChatId(stored);
    } else {
      const newId = makeChatId();
      localStorage.setItem(keys.chatId, newId);
      setChatId(newId);
    }
  }, []);

  const resetChatId = () => {
    const newId = makeChatId();
    localStorage.setItem(keys.chatId, newId);
    localStorage.removeItem(keys.messages);
    setChatId(newId);
  };

  return { chatId, resetChatId, keys };
}

// Get text content from a message's parts
function getMessageText(message: {
  parts?: Array<{ type: string; text?: string }>;
}): string {
  if (!message.parts) return '';
  return message.parts
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map((part) => part.text)
    .join('');
}

function Chat({
  chatId,
  onReset,
  initialMessages,
  transport,
  title,
  subtitle,
  storageKey,
  badgeColor,
  onReady,
}: {
  chatId: string;
  onReset: () => void;
  initialMessages: UIMessage[];
  transport: any;
  title: string;
  subtitle: string;
  storageKey: string;
  badgeColor: string;
  onReady?: (fns: { sendMessage: (opts: { text: string }) => void }) => void;
}) {
  const { messages, sendMessage, status, setMessages } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    resume: true,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    onReady?.({ sendMessage });
  }, [onReady, sendMessage]);

  // Persist messages, but exclude incomplete assistant messages during streaming
  useEffect(() => {
    if (messages.length > 0) {
      if (status === 'ready') {
        saveMessages(storageKey, messages);
      } else {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === 'assistant') {
          saveMessages(storageKey, messages.slice(0, -1));
        } else {
          saveMessages(storageKey, messages);
        }
      }
    }
  }, [messages, status, storageKey]);

  const handleClear = () => {
    setMessages([]);
    localStorage.removeItem(storageKey);
    onReset();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-xs text-gray-600">{subtitle}</p>
        </div>
        <button
          onClick={handleClear}
          className="rounded bg-gray-200 px-2 py-1 text-xs hover:bg-gray-300"
        >
          Clear
        </button>
      </div>

      <div
        className={`mb-2 rounded p-2 text-xs ${badgeColor}`}
      >
        Chat ID:{' '}
        <code className="rounded bg-white/50 px-1">{chatId}</code>
      </div>

      <div className="flex-1 space-y-3 overflow-auto rounded border p-3">
        {messages.length === 0 && (
          <p className="text-gray-400">No messages yet. Say something!</p>
        )}
        {messages.map((message, index) => {
          const isLastMessage = index === messages.length - 1;
          const isAssistantTyping =
            isLoading && isLastMessage && message.role === 'assistant';
          const text = getMessageText(message);

          return (
            <div
              key={message.id}
              className={`rounded p-3 ${
                message.role === 'user'
                  ? 'ml-auto max-w-[80%] bg-blue-100'
                  : 'mr-auto max-w-[80%] bg-gray-100'
              }`}
            >
              <div className="mb-1 text-xs font-semibold text-gray-500">
                {message.role === 'user' ? 'You' : 'Echo Bot'}
              </div>
              <div className="whitespace-pre-wrap text-sm">{text}</div>
              {isAssistantTyping && (
                <div className="mt-2 border-t border-gray-200 pt-2">
                  <TypingIndicator />
                </div>
              )}
            </div>
          );
        })}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="mr-auto max-w-[80%] rounded bg-gray-100 p-3">
            <div className="mb-1 text-xs font-semibold text-gray-500">
              Echo Bot
            </div>
            <TypingIndicator />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPanel({
  prefix,
  transport,
  title,
  subtitle,
  badgeColor,
  onReady,
}: {
  prefix: string;
  transport: any;
  title: string;
  subtitle: string;
  badgeColor: string;
  onReady?: (fns: { sendMessage: (opts: { text: string }) => void }) => void;
}) {
  const { chatId, resetChatId, keys } = useChatId(prefix);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null,
  );
  const [messagesChatId, setMessagesChatId] = useState<string | null>(null);

  useEffect(() => {
    if (chatId && chatId !== messagesChatId) {
      setInitialMessages(getStoredMessages(keys.messages));
      setMessagesChatId(chatId);
    }
  }, [chatId, messagesChatId, keys.messages]);

  const handleReset = () => {
    setInitialMessages(null);
    setMessagesChatId(null);
    resetChatId();
  };

  if (!chatId || initialMessages === null) {
    return (
      <div className="flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <Chat
      key={chatId}
      chatId={chatId}
      onReset={handleReset}
      initialMessages={initialMessages}
      transport={transport}
      title={title}
      subtitle={subtitle}
      storageKey={keys.messages}
      badgeColor={badgeColor}
      onReady={onReady}
    />
  );
}

function App({ appId }: { appId: string }) {
  const adminToken = localStorage.getItem(`ephemeral-admin-token-${appId}`);
  const [input, setInput] = useState('');
  const [resumableEnabled, setResumableEnabled] = useState(true);
  const [instantEnabled, setInstantEnabled] = useState(true);
  const sendFnsRef = useRef<
    Array<(opts: { text: string }) => void>
  >([]);

  useEffect(() => {
    if (adminToken) {
      (globalThis as any)._adminDb = initAdmin({
        ...config,
        appId,
        adminToken,
      });
    }
  }, [appId, adminToken]);

  const resumableTransport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat' }),
    [],
  );

  const instantTransport = useMemo(() => {
    if (!adminToken) return null;
    return new DefaultChatTransport({
      api: '/api/chat-instant',
      body: {
        appId,
        adminToken,
        apiURI: config.apiURI,
      },
    });
  }, [appId, adminToken]);

  const registerResumable = useCallback(
    (fns: { sendMessage: (opts: { text: string }) => void }) => {
      sendFnsRef.current[0] = fns.sendMessage;
    },
    [],
  );

  const registerInstant = useCallback(
    (fns: { sendMessage: (opts: { text: string }) => void }) => {
      sendFnsRef.current[1] = fns.sendMessage;
    },
    [],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    for (const send of sendFnsRef.current) {
      send?.({ text: input });
    }
    setInput('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">AI Echo Demo</h1>
        <p className="text-gray-600">
          Comparing Vercel AI SDK resumable streams (left) with InstantDB
          streams (right).
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <div className="flex h-full flex-col">
          <button
            onClick={() => setResumableEnabled((v) => !v)}
            className={`mb-2 rounded px-2 py-1 text-xs ${resumableEnabled ? 'bg-green-200 hover:bg-green-300' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            {resumableEnabled ? 'Disable' : 'Enable'} Resumable
          </button>
          {resumableEnabled ? (
            <div className="min-h-0 flex-1">
              <ChatPanel
                prefix="ai-echo-resumable"
                transport={resumableTransport}
                title="Resumable Streams"
                subtitle="resumable-stream + Redis/file pubsub"
                badgeColor="bg-green-50 text-green-700"
                onReady={registerResumable}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded border text-gray-400">
              Disabled
            </div>
          )}
        </div>
        <div className="flex h-full flex-col">
          <button
            onClick={() => setInstantEnabled((v) => !v)}
            className={`mb-2 rounded px-2 py-1 text-xs ${instantEnabled ? 'bg-purple-200 hover:bg-purple-300' : 'bg-gray-200 hover:bg-gray-300'}`}
          >
            {instantEnabled ? 'Disable' : 'Enable'} Instant
          </button>
          {instantEnabled && instantTransport ? (
            <div className="min-h-0 flex-1">
              <ChatPanel
                prefix="ai-echo-instant"
                transport={instantTransport}
                title="Instant Streams"
                subtitle="InstantDB admin SDK write/read streams"
                badgeColor="bg-purple-50 text-purple-700"
                onReady={registerInstant}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded border text-gray-400">
              {!instantTransport ? 'No admin token available' : 'Disabled'}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type something to echo..."
          className="flex-1 rounded border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default function Page() {
  return (
    <div className="h-screen p-4">
      <EphemeralAppPage Component={App} />
    </div>
  );
}

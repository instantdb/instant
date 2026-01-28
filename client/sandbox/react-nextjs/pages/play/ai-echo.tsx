import { useChat, type UIMessage } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState, useEffect } from 'react';

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

const STORAGE_KEYS = {
  chatId: 'ai-echo-chat-id',
  messages: 'ai-echo-messages',
};

function saveMessages(messages: UIMessage[]) {
  localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages));
}

function useChatId() {
  const [chatId, setChatId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.chatId);
    if (stored) {
      setChatId(stored);
    } else {
      const newId = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(STORAGE_KEYS.chatId, newId);
      setChatId(newId);
    }
  }, []);

  const resetChatId = () => {
    const newId = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(STORAGE_KEYS.chatId, newId);
    localStorage.removeItem(STORAGE_KEYS.messages);
    setChatId(newId);
  };

  return { chatId, resetChatId };
}

function getStoredMessages(): UIMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.messages);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
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
}: {
  chatId: string;
  onReset: () => void;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState('');

  const { messages, sendMessage, status, setMessages } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    resume: true,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Persist messages, but exclude incomplete assistant messages during streaming
  useEffect(() => {
    if (messages.length > 0) {
      if (status === 'ready') {
        // Stream complete, save all messages
        saveMessages(messages);
      } else {
        // Streaming in progress, save all except the last assistant message (which is incomplete)
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === 'assistant') {
          saveMessages(messages.slice(0, -1));
        } else {
          saveMessages(messages);
        }
      }
    }
  }, [messages, status]);

  const handleClear = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEYS.messages);
    onReset();
  };

  return (
    <div className="flex h-screen flex-col p-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Echo Demo</h1>
          <p className="text-gray-600">
            Using Vercel AI SDK v6 with resumable streams.
          </p>
        </div>
        <button
          onClick={handleClear}
          className="rounded bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300"
        >
          Clear Chat
        </button>
      </div>

      <div className="mb-2 rounded bg-green-50 p-2 text-xs text-green-700">
        <strong>Resumable Streams:</strong> Chat ID:{' '}
        <code className="rounded bg-green-100 px-1">{chatId}</code>
        {' · '}
        Messages persist to localStorage. Refresh mid-stream to test resumption!
      </div>

      <div className="mb-4 flex-1 space-y-4 overflow-auto rounded border p-4">
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
              <div className="whitespace-pre-wrap">{text}</div>
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !isLoading) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type something to echo..."
          className="flex-1 rounded border px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded bg-blue-500 px-6 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function App() {
  const { chatId, resetChatId } = useChatId();
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
    null,
  );
  const [messagesChatId, setMessagesChatId] = useState<string | null>(null);

  useEffect(() => {
    if (chatId && chatId !== messagesChatId) {
      setInitialMessages(getStoredMessages());
      setMessagesChatId(chatId);
    }
  }, [chatId, messagesChatId]);

  const handleReset = () => {
    setInitialMessages(null);
    setMessagesChatId(null);
    resetChatId();
  };

  if (!chatId || initialMessages === null) {
    return (
      <div className="flex h-screen items-center justify-center">
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
    />
  );
}

export default App;

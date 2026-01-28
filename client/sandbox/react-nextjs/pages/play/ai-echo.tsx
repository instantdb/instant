import { useChat, Message } from '@ai-sdk/react';
import { useState, useEffect, useCallback, useRef } from 'react';

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
  pendingStreamId: 'ai-echo-pending-stream',
};

function saveMessages(messages: Message[]) {
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
    localStorage.removeItem(STORAGE_KEYS.pendingStreamId);
    setChatId(newId);
  };

  return { chatId, resetChatId };
}

function getStoredMessages(): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.messages);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function Chat({
  chatId,
  onReset,
  initialMessages,
}: {
  chatId: string;
  onReset: () => void;
  initialMessages: Message[];
}) {
  const [isResuming, setIsResuming] = useState(false);
  const [resumeStatus, setResumeStatus] = useState<string | null>(null);
  const messagesRef = useRef<Message[]>(initialMessages);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
  } = useChat({
    api: '/api/chat',
    id: chatId,
    initialMessages,
    experimental_throttle: 50,
    onFinish: () => {
      localStorage.removeItem(STORAGE_KEYS.pendingStreamId);
    },
  });

  // Keep ref in sync with messages
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  // Track stream ID for resumption
  const handleSubmitWithTracking = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      const streamId = `${chatId}-${messages.length + 1}`;
      localStorage.setItem(STORAGE_KEYS.pendingStreamId, streamId);
      handleSubmit(e);
    },
    [chatId, messages.length, handleSubmit]
  );

  // Try to resume stream on mount
  useEffect(() => {
    const pendingStreamId = localStorage.getItem(STORAGE_KEYS.pendingStreamId);
    console.log('[resume] Effect running, pendingStreamId:', pendingStreamId);
    console.log('[resume] initialMessages:', initialMessages.length, initialMessages.map(m => ({ role: m.role, content: m.content?.slice(0, 50) })));

    if (!pendingStreamId) {
      console.log('[resume] No pending stream, skipping');
      return;
    }

    const lastMessage = initialMessages[initialMessages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant') {
      console.log('[resume] No assistant message to resume, clearing pendingStreamId');
      localStorage.removeItem(STORAGE_KEYS.pendingStreamId);
      return;
    }

    let cancelled = false;

    async function resumeStream() {
      setIsResuming(true);
      setResumeStatus('Attempting to resume stream...');

      let currentContent = lastMessage.content;

      try {
        // Poll until stream is complete
        while (!cancelled && pendingStreamId) {
          const response = await fetch(
            `/api/chat?streamId=${encodeURIComponent(pendingStreamId)}&position=${currentContent.length}`
          );

          if (!response.ok) {
            setResumeStatus('Stream completed or expired');
            break;
          }

          const data = await response.json();
          const { text, complete } = data;

          if (text && text.length > 0) {
            currentContent += text;
            setResumeStatus('Resuming stream...');

            // Update the message
            const updatedMessages = [...messagesRef.current];
            const lastIdx = updatedMessages.length - 1;
            if (lastIdx >= 0 && updatedMessages[lastIdx].role === 'assistant') {
              updatedMessages[lastIdx] = {
                ...updatedMessages[lastIdx],
                content: currentContent,
              };
              messagesRef.current = updatedMessages;
              setMessages(updatedMessages);
              saveMessages(updatedMessages);
            }
          }

          if (complete) {
            setResumeStatus('Stream resumed successfully!');
            break;
          }

          // Poll every 100ms while stream is still active
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err) {
        console.error('Failed to resume stream:', err);
        if (!cancelled) {
          setResumeStatus('Stream ended or unavailable');
        }
      } finally {
        if (!cancelled) {
          setTimeout(() => {
            setIsResuming(false);
            setResumeStatus(null);
          }, 2000);
        }
      }
    }

    resumeStream();

    return () => {
      cancelled = true;
    };
  }, [initialMessages, setMessages]);

  const handleClear = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEYS.messages);
    localStorage.removeItem(STORAGE_KEYS.pendingStreamId);
    onReset();
  };

  return (
    <div className="flex h-screen flex-col p-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Echo Demo</h1>
          <p className="text-gray-600">
            Using Vercel AI SDK with resumable streams.
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

      {resumeStatus && (
        <div className="mb-2 rounded bg-blue-50 p-2 text-xs text-blue-700">
          {resumeStatus}
        </div>
      )}

      <div className="mb-4 flex-1 space-y-4 overflow-auto rounded border p-4">
        {messages.length === 0 && (
          <p className="text-gray-400">No messages yet. Say something!</p>
        )}
        {messages.map((message, index) => {
          const isLastMessage = index === messages.length - 1;
          const isAssistantTyping =
            (isLoading || isResuming) &&
            isLastMessage &&
            message.role === 'assistant';

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
              <div className="whitespace-pre-wrap">{message.content}</div>
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

      <form onSubmit={handleSubmitWithTracking} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Type something to echo..."
          className="flex-1 rounded border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading || isResuming}
        />
        <button
          type="submit"
          disabled={isLoading || isResuming || !input.trim()}
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
  const [initialMessages, setInitialMessages] = useState<Message[] | null>(
    null
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

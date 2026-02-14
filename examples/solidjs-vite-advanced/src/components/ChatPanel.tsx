import {
  type Component,
  createSignal,
  For,
  createMemo,
  onMount,
} from "solid-js";
import { db, chatRoom } from "../lib/db";

type ChatMessage = {
  message: string;
  sender: string;
  timestamp: number;
};

const ChatPanel: Component = () => {
  const user = db.useUser();
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [input, setInput] = createSignal("");
  let messagesEnd: HTMLDivElement | undefined;

  const nickname = createMemo(() => user().email?.split("@")[0] ?? "anon");

  // Publish topic
  const publishChat = db.rooms.usePublishTopic(chatRoom, "chat");

  // Receive messages from peers (topics don't echo to sender)
  db.rooms.useTopicEffect(chatRoom, "chat", (event, _peer) => {
    setMessages((prev) => [...prev, event as ChatMessage]);
    scrollToBottom();
  });

  // Typing indicator
  const typing = db.rooms.useTypingIndicator(chatRoom, "chat-input", {
    timeout: 2000,
    stopOnEnter: true,
  });

  const typingNames = createMemo(() => {
    const active = typing.active();
    return (active as any[])
      .map((p: any) => p.nickname || "someone")
      .filter(Boolean);
  });

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEnd?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  };

  const handleSend = (e: Event) => {
    e.preventDefault();
    const text = input().trim();
    if (!text) return;

    const msg: ChatMessage = {
      message: text,
      sender: nickname(),
      timestamp: Date.now(),
    };

    // Topics don't echo to sender, so add own message locally
    setMessages((prev) => [...prev, msg]);
    publishChat(msg);
    setInput("");
    scrollToBottom();
  };

  onMount(() => scrollToBottom());

  return (
    <div class="bg-white rounded-lg shadow p-4 flex flex-col space-y-3">
      <h2 class="font-bold text-lg">Chat</h2>

      <div class="flex-1 min-h-48 max-h-72 overflow-y-auto space-y-1 bg-gray-50 rounded p-2">
        <For
          each={messages()}
          fallback={
            <p class="text-gray-400 text-sm text-center py-8">
              No messages yet. Say hello!
            </p>
          }
        >
          {(msg) => (
            <div class="text-sm">
              <span class="font-medium text-gray-700">{msg.sender}: </span>
              <span class="text-gray-600">{msg.message}</span>
            </div>
          )}
        </For>
        <div ref={messagesEnd} />
      </div>

      {typingNames().length > 0 && (
        <p class="text-xs text-gray-400 italic">
          {typingNames().join(", ")} {typingNames().length === 1 ? "is" : "are"}{" "}
          typing...
        </p>
      )}

      <form onSubmit={handleSend} class="flex gap-2">
        <input
          type="text"
          placeholder="Type a message..."
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={typing.inputProps.onKeyDown}
          onBlur={typing.inputProps.onBlur}
          class="flex-1 border rounded px-2 py-1 text-sm"
        />
        <button
          type="submit"
          class="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;

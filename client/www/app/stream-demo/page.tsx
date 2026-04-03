'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const question = 'How should I display AI responses in my app?';
const answer =
  'You can use Instant streams to display tokens as they arrive. Each token is broadcast to every connected client in real-time. Streams work across refreshes and network drops too, so you can build durable AI experiences without adding Redis.';

// ─── Laptop Frame ───────────────────────────────────────

function LaptopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[480px] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
      <div className="flex items-center border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="flex-1" />
        <img
          src="/img/landing/daniel.png"
          alt="Daniel"
          className="h-6 w-6 rounded-full object-cover ring-2 ring-white"
        />
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

// ─── Phone Frame ────────────────────────────────────────

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-[500px] w-[260px] flex-col overflow-hidden rounded-[2.5rem] border-[3px] border-gray-800 bg-white shadow-xl">
      {/* Status bar */}
      <div className="flex items-center justify-between px-6 py-2">
        <span className="text-[10px] font-semibold text-gray-800">9:41</span>
        <div className="h-4 w-16 rounded-full bg-gray-900" />
        <div className="flex items-center gap-1">
          <div className="h-2 w-4 rounded-sm border border-gray-800">
            <div className="m-px h-full w-2/3 rounded-sm bg-gray-800" />
          </div>
        </div>
      </div>
      {/* Content */}
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      {/* Home indicator */}
      <div className="flex justify-center py-2">
        <div className="h-1 w-24 rounded-full bg-gray-300" />
      </div>
    </div>
  );
}

// ─── Chat Panel ─────────────────────────────────────────

function ChatPanel({
  userMsg,
  aiText,
  showAiCursor,
  inputText,
  compact,
}: {
  userMsg: string;
  aiText: string;
  showAiCursor: boolean;
  inputText: string;
  compact?: boolean;
}) {
  const textSize = compact ? 'text-sm' : 'text-base';
  const px = compact ? 'px-3' : 'px-5';
  const bubblePx = compact ? 'px-3 py-2' : 'px-4 py-2.5';
  const avatarImg = compact ? 'h-5 w-5' : 'h-7 w-7';

  return (
    <div className="flex flex-1 flex-col">
      <div
        className={`flex flex-1 flex-col justify-end gap-2.5 overflow-hidden ${px} py-3`}
      >
        {userMsg && (
          <div className="flex items-end justify-end gap-2">
            <div
              className={`max-w-[75%] rounded-2xl rounded-br-md bg-orange-500 ${bubblePx} ${textSize} text-white`}
            >
              {userMsg}
            </div>
            <img
              src="/img/landing/daniel.png"
              alt="Drew"
              className={`${avatarImg} shrink-0 rounded-full object-cover`}
            />
          </div>
        )}
        {aiText && (
          <div className="flex items-start justify-start gap-2">
            <div
              className={`mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-gray-800 text-white ${compact ? 'h-5 w-5 p-[3px]' : 'h-7 w-7 p-1'}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-full w-full"
              >
                <path d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z" />
              </svg>
            </div>
            <div
              className={`max-w-[85%] rounded-2xl rounded-bl-md bg-gray-100 ${bubblePx} ${textSize} text-gray-800`}
            >
              {aiText}
              {showAiCursor && (
                <span className="animate-pulse text-gray-400"> ▌</span>
              )}
            </div>
          </div>
        )}
      </div>
      <div
        className={`border-t border-gray-100 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
      >
        <div
          className={`flex items-center rounded-xl border border-gray-200 bg-gray-50 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}
        >
          <div className={`flex-1 ${textSize} text-gray-700`}>
            {inputText ? (
              <span>
                {inputText}
                <span className="animate-pulse text-gray-400">|</span>
              </span>
            ) : (
              <span className="text-gray-400">Ask anything...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

export default function StreamDemo4Page() {
  const [inputText, setInputText] = useState('');
  const [showUserLeft, setShowUserLeft] = useState(false);
  const [showUserRight, setShowUserRight] = useState(false);
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const [streaming, setStreaming] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = (fn: () => void, ms: number) => {
    timeouts.current.push(setTimeout(fn, ms));
  };

  const runCycle = useCallback(() => {
    clear();
    setInputText('');
    setShowUserLeft(false);
    setShowUserRight(false);
    setLeftText('');
    setRightText('');
    setStreaming(false);

    let t = 800;

    // Type question
    for (let i = 0; i <= question.length; i++) {
      const text = question.slice(0, i);
      sched(() => setInputText(text), t + i * 40);
    }
    t += question.length * 40 + 500;

    // Send
    sched(() => {
      setShowUserLeft(true);
      setShowUserRight(true);
      setInputText('');
    }, t);
    t += 600;

    // Stream char-by-char, blazing fast
    sched(() => setStreaming(true), t);
    const CHAR_DELAY = 5;
    const RIGHT_LAG = 40;

    for (let i = 1; i <= answer.length; i++) {
      const slice = answer.slice(0, i);
      sched(() => setLeftText(slice), t + i * CHAR_DELAY);
      sched(() => setRightText(slice), t + i * CHAR_DELAY + RIGHT_LAG);
    }
    t += answer.length * CHAR_DELAY + RIGHT_LAG + 200;
    sched(() => setStreaming(false), t);

    // Loop
    t += 3000;
    sched(() => runCycle(), t);
  }, [clear]);

  useEffect(() => {
    runCycle();
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div className="relative flex min-h-screen items-center justify-center gap-12 bg-radial from-white to-[#FFF9F4] p-8">
      <a
        href="/demos"
        className="absolute top-4 left-4 z-50 text-xs text-gray-400 hover:text-gray-600"
      >
        &larr; All Demos
      </a>
      <LaptopFrame>
        <ChatPanel
          userMsg={showUserLeft ? question : ''}
          aiText={leftText}
          showAiCursor={streaming && leftText.length < answer.length}
          inputText={inputText}
        />
      </LaptopFrame>

      <PhoneFrame>
        <ChatPanel
          userMsg={showUserRight ? question : ''}
          aiText={rightText}
          showAiCursor={streaming && rightText.length < answer.length}
          inputText=""
          compact
        />
      </PhoneFrame>
    </div>
  );
}

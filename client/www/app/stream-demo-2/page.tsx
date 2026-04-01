'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const question = 'How should I display AI responses in my app?';
const answer =
  'You can use Instant streams to display tokens as they arrive. Each token is broadcast to every connected client in real-time. Streams work across refreshes and network drops too, so you can build durable AI experiences without adding Redis.';
const answerWords = answer.split(' ');

// ─── Shared UI ──────────────────────────────────────────

function BrowserWindow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[480px] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <div className="h-3 w-3 rounded-full bg-yellow-400" />
          <div className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 text-center text-xs font-medium text-gray-400">
          {title}
        </div>
        <div className="w-[54px]" />
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

function ChatPanel({
  userMsg,
  aiText,
  showAiCursor,
  inputText,
}: {
  userMsg: string;
  aiText: string;
  showAiCursor: boolean;
  inputText: string;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden px-5 py-4">
        {userMsg && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-orange-500 px-4 py-2.5 text-base text-white">
              {userMsg}
            </div>
          </div>
        )}
        {aiText && (
          <div className="flex justify-start gap-2">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-white">
              AI
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-gray-100 px-4 py-2.5 text-base text-gray-800">
              {aiText}
              {showAiCursor && (
                <span className="animate-pulse text-gray-400"> ▌</span>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <div className="flex-1 text-base text-gray-700">
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

export default function StreamDemo2Page() {
  const [inputText, setInputText] = useState('');
  const [showUserLeft, setShowUserLeft] = useState(false);
  const [showUserRight, setShowUserRight] = useState(false);
  const [leftCount, setLeftCount] = useState(0);
  const [rightCount, setRightCount] = useState(0);
  const [streaming, setStreaming] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);

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
    setLeftCount(0);
    setRightCount(0);
    setStreaming(false);

    let t = 800;

    // Type question into input
    for (let i = 0; i <= question.length; i++) {
      const text = question.slice(0, i);
      sched(() => setInputText(text), t + i * 40);
    }
    t += question.length * 40 + 500;

    // Send
    sched(() => {
      setShowUserLeft(true);
      setInputText('');
    }, t);
    t += 300;
    sched(() => setShowUserRight(true), t);
    t += 600;

    // Stream AI response
    sched(() => setStreaming(true), t);
    const WORD_DELAY = 80;
    const RIGHT_LAG = 250;

    for (let i = 1; i <= answerWords.length; i++) {
      sched(() => setLeftCount(i), t + i * WORD_DELAY);
      sched(() => setRightCount(i), t + i * WORD_DELAY + RIGHT_LAG);
    }
    t += answerWords.length * WORD_DELAY + RIGHT_LAG + 300;
    sched(() => setStreaming(false), t);

    t += 3000;
    sched(() => runCycle(), t);
  }, [clear]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runCycle();
    }
    return () => clear();
  }, [runCycle, clear]);

  return (
    <div className="flex min-h-screen items-center justify-center gap-8 bg-radial from-white to-[#FFF9F4] p-8">
      <BrowserWindow title="My App — Tab 1">
        <ChatPanel
          userMsg={showUserLeft ? question : ''}
          aiText={answerWords.slice(0, leftCount).join(' ')}
          showAiCursor={streaming && leftCount < answerWords.length}
          inputText={inputText}
        />
      </BrowserWindow>
      <BrowserWindow title="My App — Tab 2">
        <ChatPanel
          userMsg={showUserRight ? question : ''}
          aiText={answerWords.slice(0, rightCount).join(' ')}
          showAiCursor={streaming && rightCount < answerWords.length}
          inputText=""
        />
      </BrowserWindow>
    </div>
  );
}

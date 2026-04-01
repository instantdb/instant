'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const question = 'Write a React component for AI chat';
const codeLines = [
  'import { init } from "@instantdb/react";',
  '',
  'const db = init({ appId: "my-app-id" });',
  '',
  'export function AIChat({ prompt }) {',
  '  const stream = db.useStream("ai-response", {',
  '    prompt,',
  '  });',
  '',
  '  return (',
  '    <div className="prose">',
  '      {stream?.tokens.map((token, i) => (',
  '        <span key={i}>{token}</span>',
  '      ))}',
  '    </div>',
  '  );',
  '}',
];

// ─── Shared UI ──────────────────────────────────────────

function BrowserWindow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[560px] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
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

function CodeChatPanel({
  userMsg,
  visibleLines,
  showCursor,
  inputText,
}: {
  userMsg: string;
  visibleLines: number;
  showCursor: boolean;
  inputText: string;
}) {
  const codeText = codeLines.slice(0, visibleLines).join('\n');

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
        {visibleLines > 0 && (
          <div className="flex justify-start gap-2">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-white">
              AI
            </div>
            <div className="max-w-[90%] overflow-hidden rounded-2xl rounded-bl-md bg-gray-900 px-4 py-3">
              <pre className="font-mono text-[13px] leading-relaxed text-gray-100 whitespace-pre">
                {codeText}
                {showCursor && (
                  <span className="animate-pulse text-green-400">▌</span>
                )}
              </pre>
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

export default function StreamDemo5Page() {
  const [inputText, setInputText] = useState('');
  const [showUserLeft, setShowUserLeft] = useState(false);
  const [showUserRight, setShowUserRight] = useState(false);
  const [leftLines, setLeftLines] = useState(0);
  const [rightLines, setRightLines] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [rightConnected, setRightConnected] = useState(false);

  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = useRef(false);

  const clear = useCallback(() => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  }, []);

  const sched = (fn: () => void, ms: number) => {
    timeouts.current.push(setTimeout(fn, ms));
  };

  const totalLines = codeLines.length;
  const connectAtLine = Math.floor(totalLines * 0.45);

  const runCycle = useCallback(() => {
    clear();
    setInputText('');
    setShowUserLeft(false);
    setShowUserRight(false);
    setLeftLines(0);
    setRightLines(0);
    setStreaming(false);
    setRightConnected(false);

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
      setInputText('');
    }, t);
    t += 600;

    // Start streaming code on left
    sched(() => setStreaming(true), t);
    const LINE_DELAY = 180;
    const CATCHUP_DELAY = 30;

    for (let i = 1; i <= totalLines; i++) {
      sched(() => setLeftLines(i), t + i * LINE_DELAY);
    }

    // Right panel connects when left is at ~45%
    const connectTime = t + connectAtLine * LINE_DELAY;
    sched(() => {
      setRightConnected(true);
      setShowUserRight(true);
    }, connectTime);

    // Right panel: rapid catch-up, then normal speed
    const catchupStart = connectTime + 200;
    for (let i = 1; i <= totalLines; i++) {
      let time: number;
      if (i <= connectAtLine) {
        // Catch-up phase: rapid replay
        time = catchupStart + i * CATCHUP_DELAY;
      } else {
        // Sync phase: follow left with small lag
        const catchupEnd = catchupStart + connectAtLine * CATCHUP_DELAY;
        time = catchupEnd + (i - connectAtLine) * LINE_DELAY;
      }
      sched(() => setRightLines(i), time);
    }

    t += totalLines * LINE_DELAY + 300;
    sched(() => setStreaming(false), t);

    t += 3000;
    sched(() => runCycle(), t);
  }, [clear, totalLines, connectAtLine]);

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
        <CodeChatPanel
          userMsg={showUserLeft ? question : ''}
          visibleLines={leftLines}
          showCursor={streaming && leftLines < totalLines}
          inputText={inputText}
        />
      </BrowserWindow>

      <BrowserWindow title="My App — Tab 2">
        {rightConnected ? (
          <CodeChatPanel
            userMsg={showUserRight ? question : ''}
            visibleLines={rightLines}
            showCursor={streaming && rightLines < totalLines}
            inputText=""
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-300">
            <svg
              className="h-10 w-10"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
              />
            </svg>
            <p className="text-sm font-medium">Waiting to connect...</p>
          </div>
        )}
      </BrowserWindow>
    </div>
  );
}

'use client';

import { useState } from 'react';

const SUGGESTIONS = [
  'a realtime todo app',
  'a multiplayer whiteboard',
  'a Figma for poems',
  'a chat app for two cats',
  'a habit tracker',
];

const MAX_LENGTH = 240;

function buildPromptText(idea: string) {
  return `${idea}\n\nTo get a backend (database, auth, storage, real-time, more), curl https://getadb.com/guide and follow the instructions.`;
}

export function HumanForm() {
  const [idea, setIdea] = useState('');
  const [copied, setCopied] = useState(false);

  const trimmed = idea.trim();
  const disabled = trimmed.length === 0;
  const overLimit = idea.length > MAX_LENGTH;
  const previewIdea = trimmed.length === 0 ? 'your idea here' : trimmed;

  async function handleCopy() {
    if (disabled) return;
    const text = buildPromptText(trimmed);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-[0.35rem] font-mono text-base text-orange-600 sm:text-lg"
          >
            ›
          </span>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="a realtime todo app"
            rows={1}
            className="min-w-0 flex-1 resize-none border-0 bg-transparent p-0 text-base text-gray-900 placeholder:text-gray-400 focus:ring-0 focus:outline-none sm:text-lg"
          />
          <span
            className={`mt-[0.4rem] shrink-0 font-mono text-xs ${
              overLimit ? 'text-orange-600' : 'text-gray-400'
            }`}
          >
            {idea.length}/{MAX_LENGTH}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setIdea(s)}
              className="rounded-full bg-gray-100 px-3 py-1 font-mono text-xs text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800 sm:text-sm"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200" />

      <div className="px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] tracking-[0.18em] text-gray-500 uppercase sm:text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-600" />
            <span>Prompt for your agent</span>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={disabled || overLimit}
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copied ? 'copied!' : 'copy prompt'}
          </button>
        </div>

        <pre className="mt-5 font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-700">
          {buildPromptText(previewIdea)}
        </pre>
      </div>
    </div>
  );
}

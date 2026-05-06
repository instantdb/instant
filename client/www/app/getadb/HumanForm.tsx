'use client';

import { useState } from 'react';

function buildPromptText(idea: string) {
  return `Build me ${idea}.

For the backend, curl getadb.com/guide. It will give you credentials and instructions for a full Instant backend (relational db, sync engine, auth, presence, streams).`;
}

export function HumanForm({ className = '' }: { className?: string }) {
  const [idea, setIdea] = useState('');
  const [copied, setCopied] = useState(false);

  const trimmed = idea.trim();
  const disabled = trimmed.length === 0;
  const previewText = buildPromptText(trimmed.length === 0 ? '<your idea>' : trimmed);

  async function handleCopy() {
    if (disabled) return;
    await navigator.clipboard.writeText(buildPromptText(trimmed));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div
      className={`overflow-hidden rounded-lg border border-secondary-border bg-white ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-[#F2EEE6] px-4 pt-3.5 pb-2">
        <span
          aria-hidden
          className="font-mono text-base leading-none font-bold text-orange-600"
        >
          ›
        </span>
        <input
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="a realtime todo app"
          className="w-full bg-transparent text-lg outline-none placeholder:text-gray-400"
        />
      </div>
      <div className="relative">
        <pre className="m-0 px-4 py-4 pr-28 font-mono text-[13px] leading-[1.7] whitespace-pre-wrap text-gray-700">
          {previewText}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          disabled={disabled}
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? (
            '✓ copied'
          ) : (
            <>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy prompt
            </>
          )}
        </button>
      </div>
    </div>
  );
}

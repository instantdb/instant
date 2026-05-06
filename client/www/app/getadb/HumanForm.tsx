'use client';

import { useState } from 'react';

function buildPromptText(idea: string) {
  return `${idea}

Use InstantDB for your backend. For credentials and instructions, fetch http://www.getadb.com/guide and follow the steps.`;
}

export function HumanForm({ className = '' }: { className?: string }) {
  const [idea, setIdea] = useState('');
  const [copied, setCopied] = useState(false);

  const trimmed = idea.trim();
  const previewText = buildPromptText(
    trimmed.length === 0 ? '<your app idea here>' : trimmed,
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={`overflow-hidden rounded-lg border border-gray-200 bg-white ${className}`}
    >
      <div className="border-b border-gray-200/70 px-4 py-3">
        <input
          autoFocus
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="Write your dream app idea!"
          className="w-full border-0 bg-transparent p-0 text-base placeholder:text-gray-400 focus:border-0 focus:ring-0 focus:outline-none sm:text-lg"
        />
      </div>
      <div className="relative">
        <pre className="m-0 px-4 py-4 pr-32 font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-700">
          {previewText}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-3 right-3 inline-flex items-center justify-center rounded-lg border border-transparent bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-orange-700"
        >
          {copied ? 'Copied!' : 'Copy prompt'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';

export function AgentCurlChip({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-3 rounded-md border border-secondary-border bg-white px-4 py-2.5 transition-colors hover:border-orange-600"
    >
      <span className="font-mono font-bold text-orange-600">$</span>
      <span className="font-mono text-gray-700">{cmd}</span>
      <span className="text-xs text-gray-400">
        {copied ? '✓ copied' : 'click to copy'}
      </span>
    </button>
  );
}

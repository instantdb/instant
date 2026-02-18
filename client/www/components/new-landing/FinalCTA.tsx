'use client';

import { useState } from 'react';
import { Button } from './Button';
import { AnimateIn } from './AnimateIn';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="text-gray-400 transition-colors hover:text-gray-600"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg
          className="h-4 w-4 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m4.5 12.75 6 6 9-13.5"
          />
        </svg>
      ) : (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
          />
        </svg>
      )}
    </button>
  );
}

export function FinalCTA() {
  return (
    <div className="text-center">
      <AnimateIn>
        <h2 className="text-3xl font-semibold sm:text-4xl lg:text-5xl">
          Ship something delightful.
        </h2>
      </AnimateIn>

      <AnimateIn delay={100}>
        {/* Terminal command */}
        <div className="mt-8 inline-flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 font-mono">
          <span className="text-orange-600">$</span>
          <span className="text-gray-700">npx create-instant-app</span>
          <CopyButton text="npx create-instant-app" />
        </div>
      </AnimateIn>

      <AnimateIn delay={200}>
        <div className="mt-8">
          <Button size="lg" className="glow-pulse px-8 py-3.5 text-base">
            Get a DB
          </Button>
        </div>
      </AnimateIn>
    </div>
  );
}

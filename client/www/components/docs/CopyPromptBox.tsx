import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui';

interface CopyPromptBoxProps {
  id?: string;
  description?: string;
}

const defaultFile = '/docs/index.md';
const promptFiles: Record<string, string> = {
  default: defaultFile,
  react: '/docs/index.md',
  expo: '/docs/start-rn.md',
  vanilla: '/docs/start-vanilla.md',
};

// Cache for fetched content
const contentCache: Record<string, string> = {};

export function CopyPromptBox({
  id = 'default',
  description = 'Use this prompt to get started faster.',
}: CopyPromptBoxProps) {
  const [copyLabel, setCopyLabel] = useState('Copy prompt');
  const fetchingRef = useRef(false);

  // Prefetch content when component mounts
  // Fixes bug in Safari where clipboard API would fail on first use
  useEffect(() => {
    if (!contentCache[id]) {
      fetch(promptFiles[id])
        .then((response) => response.text())
        .then((content) => {
          contentCache[id] = content;
        })
        .catch((err) => console.error('Failed to prefetch prompt:', err));
    }
  }, [id]);

  const handleCopy = async () => {
    if (fetchingRef.current) return;
    try {
      fetchingRef.current = true;

      // Use cached content if available
      let content = contentCache[id];

      if (!content) {
        const response = await fetch(promptFiles[id]);
        content = await response.text();
        contentCache[id] = content;
      }

      await navigator.clipboard.writeText(content);
      setCopyLabel('Copied!');
      setTimeout(() => {
        setCopyLabel('Copy prompt');
      }, 2000);
    } catch (error) {
      console.error('Failed to copy prompt:', error);
      setCopyLabel('Failed');
      setTimeout(() => {
        setCopyLabel('Copy prompt');
      }, 2000);
    } finally {
      fetchingRef.current = false;
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-orange-600 px-4 py-4 text-center shadow-sm md:grid md:grid-cols-[1fr_auto] md:space-y-0 md:text-start">
      <div className="text-gray-700">{description}</div>
      <Button size="mini" variant="cta" onClick={handleCopy}>
        {copyLabel}
      </Button>
    </div>
  );
}

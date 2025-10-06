import { useState, useRef } from 'react';
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
    <div className="relative flex items-center justify-between rounded-lg border border-orange-600 px-4 shadow-sm">
      <p className="text-gray-700">{description}</p>

      <Button variant="cta" onClick={handleCopy}>
        {copyLabel}
      </Button>
    </div>
  );
}

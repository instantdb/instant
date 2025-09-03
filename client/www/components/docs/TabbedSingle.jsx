import { useState, useContext } from 'react';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { SelectedAppContext } from '@/lib/SelectedAppContext';
import useLocalStorage from '@/lib/hooks/useLocalStorage';

/**
 * TabbedSingle - A component for displaying single-line content with tab selection.
 *
 * Useful for things like showiing one-liners for different platforms /
 * framworks / etc. (e.g. Next.js, Expo, Vanilla TS, etc.)
 *
 * @param {Object} tabs - Object with tab keys containing { label, content }
 * @param {string} defaultTab - Optional default selected tab key
 * @param {string} storageKey - Optional unique key for localStorage persistence
 */
export function TabbedSingle({ tabs, defaultTab, storageKey }) {
  // Defensive check for tabs
  if (!tabs || Object.keys(tabs).length === 0) {
    return null;
  }

  const defaultValue = defaultTab || Object.keys(tabs)[0];

  // Use localStorage if storageKey is provided, otherwise use regular state
  const [selectedTab, setSelectedTab] = storageKey
    ? useLocalStorage(`tabbed-single-${storageKey}`, defaultValue)
    : useState(defaultValue);

  const [copyLabel, setCopyLabel] = useState('Copy');
  const app = useContext(SelectedAppContext);

  const currentTab = tabs[selectedTab];

  // Defensive check for currentTab
  if (!currentTab) {
    return null;
  }

  let content = currentTab.content || '';

  // Replace __APP_ID__ with actual app ID if available
  if (app && content.includes('__APP_ID__')) {
    content = content.replace('__APP_ID__', app.id);
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopyLabel('Copied!');
    setTimeout(() => {
      setCopyLabel('Copy');
    }, 2000);
  };

  return (
    <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-white my-4">
      {/* Tab bar */}
      <div className="flex bg-gray-50 border-b border-gray-200">
        {Object.entries(tabs).map(([key, tab]) => (
          <button
            key={key}
            onClick={() => setSelectedTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              selectedTab === key
                ? 'bg-white text-gray-900 border-b-2 border-blue-500 -mb-[2px]'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative bg-white py-1">
        <pre className="text-xs text-gray-900 overflow-x-auto whitespace-pre font-mono bg-white m-0">
          {content}
        </pre>
        <div className="absolute top-0 right-0 m-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-x-1 bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 rounded"
          >
            <ClipboardDocumentIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {copyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

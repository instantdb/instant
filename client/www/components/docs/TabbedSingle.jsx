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
 * @param {string} storageKey - Required unique key for localStorage persistence
 */
export function TabbedSingle({ tabs, defaultTab, storageKey }) {
  const defaultValue = defaultTab || (tabs && Object.keys(tabs)[0]) || '';

  // Always call hooks before any conditional returns
  const [selectedTab, setSelectedTab] = useLocalStorage(
    `tabbed-single-${storageKey}`,
    defaultValue,
  );
  const [copyLabel, setCopyLabel] = useState('Copy');
  const app = useContext(SelectedAppContext);

  if (!tabs || Object.keys(tabs).length === 0) {
    return null;
  }

  const currentTab = tabs[selectedTab];

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
    <div className="relative my-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {Object.entries(tabs).map(([key, tab]) => (
          <button
            key={key}
            onClick={() => setSelectedTab(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              selectedTab === key
                ? '-mb-[2px] border-b-2 border-blue-500 bg-white text-gray-900'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative bg-white py-1">
        <pre className="m-0 overflow-x-auto whitespace-pre bg-white font-mono text-xs text-gray-900">
          {content}
        </pre>
        <div className="absolute right-0 top-0 m-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-x-1 rounded bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            <ClipboardDocumentIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {copyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

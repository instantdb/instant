import { useState, type ReactNode } from 'react';
import Highlight, { defaultProps } from 'prism-react-renderer';
import { cn } from '@/components/ui';

const editorTheme = {
  plain: {
    backgroundColor: '#faf8f5',
    color: '#575279',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'cdata', 'punctuation'],
      style: { color: '#797593' },
    },
    {
      types: ['delimiter', 'important', 'atrule', 'operator', 'keyword'],
      style: { color: '#286983' },
    },
    {
      types: [
        'tag',
        'doctype',
        'variable',
        'regex',
        'class-name',
        'selector',
        'inserted',
      ],
      style: { color: '#56949f' },
    },
    {
      types: ['boolean', 'entity', 'number', 'symbol', 'function'],
      style: { color: '#d7827e' },
    },
    {
      types: ['string', 'char', 'property', 'attr-value'],
      style: { color: '#ea9d34' },
    },
    {
      types: ['parameter', 'url', 'attr-name', 'builtin'],
      style: { color: '#907aa9' },
    },
    { types: ['deleted'], style: { color: '#b4637a' } },
  ],
};

function CodeEditor({ code, language }: { code: string; language: string }) {
  return (
    <Highlight
      {...defaultProps}
      code={code.trimEnd()}
      language={language as any}
      theme={editorTheme}
    >
      {({ tokens, getTokenProps }) => (
        <pre
          className="m-0 p-4 font-mono text-sm leading-relaxed"
          style={{ backgroundColor: '#faf8f5' }}
        >
          <code>
            {tokens.map((line, lineIndex) => (
              <span key={lineIndex} className="flex">
                <span className="inline-block w-8 shrink-0 text-right text-gray-400/60 select-none">
                  {lineIndex + 1}
                </span>
                <span className="ml-4 flex-1">
                  {line
                    .filter((token) => !token.empty)
                    .map((token, tokenIndex) => {
                      const { key, ...props } = getTokenProps({ token });
                      return <span key={key || tokenIndex} {...props} />;
                    })}
                </span>
              </span>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}

function PillTray({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-gray-200/60 p-1.5">
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function TabbedCodeExample({
  examples,
  tabs,
  height = 'h-72',
}: {
  examples: { label: string; [key: string]: string }[];
  tabs: { key: string; label: string; language?: string }[];
  height?: string;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeTabKey, setActiveTabKey] = useState(tabs[0].key);
  const example = examples[selectedIdx];
  const activeTab = tabs.find((t) => t.key === activeTabKey) || tabs[0];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PillTray>
        {examples.map((ex, i) => (
          <button
            key={ex.label}
            onClick={() => setSelectedIdx(i)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              i === selectedIdx
                ? 'border-orange-600 bg-orange-600 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            {ex.label}
          </button>
        ))}
      </PillTray>
      <div
        className="min-w-0 overflow-hidden rounded-lg border border-gray-200"
        style={{ backgroundColor: '#faf8f5' }}
      >
        <div className="flex border-b border-gray-200/60">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTabKey(tab.key)}
              className={cn(
                'border-r border-r-gray-200/60 px-4 py-2 text-sm font-medium transition-colors',
                activeTabKey === tab.key
                  ? 'text-gray-900 shadow-[inset_0_-2px_0_0_#f97316]'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={cn(height, 'overflow-auto text-sm')}>
          <CodeEditor
            language={activeTab.language || 'javascript'}
            code={example[activeTab.key]}
          />
        </div>
      </div>
    </div>
  );
}

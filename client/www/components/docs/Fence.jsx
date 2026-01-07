import { Fragment, useContext } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import Highlight, { defaultProps } from 'prism-react-renderer';
import { useState } from 'react';
import { SelectedAppContext } from '@/lib/SelectedAppContext';
import { rosePineDawnTheme } from '@/lib/rosePineDawnTheme';

function parseLineHighlights(lineHighlight) {
  if (!lineHighlight) {
    return new Set();
  }

  const highlights = new Set();
  const ranges = String(lineHighlight).split(',');

  for (const range of ranges) {
    const [startRaw, endRaw] = range.split('-').map((part) => part.trim());
    const start = Number.parseInt(startRaw, 10);
    if (!Number.isFinite(start)) {
      continue;
    }

    const end = endRaw ? Number.parseInt(endRaw, 10) : start;
    if (!Number.isFinite(end)) {
      continue;
    }

    const from = Math.min(start, end);
    const to = Math.max(start, end);
    for (let i = from; i <= to; i += 1) {
      highlights.add(i);
    }
  }

  return highlights;
}

export function Fence({ children, language, showCopy, lineHighlight }) {
  const [copyLabel, setCopyLabel] = useState('Copy');

  const app = useContext(SelectedAppContext);
  const highlightedLines = parseLineHighlights(lineHighlight);

  const code = children
    .trimEnd()
    .replace(
      '// Instant app',
      app
        ? `// ID for app: ${app.title}`
        : `// Visit https://instantdb.com/dash to get your APP_ID :)`,
    )
    .replace('__APP_ID__', app ? app.id : '__APP_ID__');

  return (
    <Highlight
      {...defaultProps}
      code={code}
      language={language}
      theme={rosePineDawnTheme}
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <div className="relative text-sm">
          <pre className={className} style={style}>
            {tokens.map((line, lineIndex) => {
              const isHighlighted = highlightedLines.has(lineIndex + 1);
              let lineTokens = line
                .filter((token) => !token.empty)
                .map((token, tokenIndex) => {
                  const { key, ...props } = getTokenProps({ token });
                  return <span key={key || tokenIndex} {...props} />;
                });

              if (lineTokens.length === 0) {
                lineTokens = [<span key="empty"> </span>];
              }

              const lineProps = getLineProps({
                line,
                key: lineIndex,
                className: isHighlighted ? 'highlighted' : undefined,
              });

              return <div {...lineProps}>{lineTokens}</div>;
            })}
          </pre>
          {showCopy && (
            <div className="absolute top-0 right-0 m-2">
              <CopyToClipboard text={code}>
                <button
                  onClick={() => {
                    setCopyLabel('Copied!');
                    setTimeout(() => {
                      setCopyLabel('Copy');
                    }, 2500);
                  }}
                  className="flex items-center gap-x-1 bg-white px-2 py-1 text-xs font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50"
                >
                  <ClipboardDocumentIcon
                    className="-ml-0.5 h-4 w-4"
                    aria-hidden="true"
                  />
                  {copyLabel}
                </button>
              </CopyToClipboard>
            </div>
          )}
        </div>
      )}
    </Highlight>
  );
}

export function HasAppID({ children, elseChildren }) {
  const app = useContext(SelectedAppContext);

  if (app) {
    return <Fragment>{children}</Fragment>;
  } else {
    if (elseChildren) {
      return <Fragment>{elseChildren}</Fragment>;
    }
  }
}

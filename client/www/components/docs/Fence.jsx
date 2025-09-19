import { Fragment, useContext } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import Highlight, { defaultProps } from 'prism-react-renderer';
import { useState } from 'react';
import { SelectedAppContext } from '@/lib/SelectedAppContext';

export function Fence({ children, language, showCopy }) {
  const [copyLabel, setCopyLabel] = useState('Copy');

  const app = useContext(SelectedAppContext);

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
      theme={undefined}
    >
      {({ className, style, tokens, getTokenProps }) => (
        <div className="relative text-sm bg-gray-50 dark:bg-slate-800 rounded">
          <pre className={`${className} bg-transparent`} style={style}>
            {tokens.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {line
                  .filter((token) => !token.empty)
                  .map((token, tokenIndex) => {
                    const { key, ...props } = getTokenProps({ token });
                    return <span key={key || tokenIndex} {...props} />;
                  })}
                {'\n'}
              </Fragment>
            ))}
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
                  className="flex items-center gap-x-1
             bg-white dark:bg-slate-700 px-2 py-1 text-xs font-semibold text-gray-900 dark:text-gray-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600"
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

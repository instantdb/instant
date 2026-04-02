'use client';
import { Editor, Monaco, OnMount } from '@monaco-editor/react';
import clsx from 'clsx';
import copy from 'copy-to-clipboard';
import React, { Fragment, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import Highlight, { defaultProps } from 'prism-react-renderer';
import { ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import { parsePermsJSON } from '@lib/utils/parsePermsJSON';
import { useMonacoJSONSchema } from '@lib/hooks/useMonacoJSONSchema';
import { cn } from './cn';
import { Button } from './button';
import { rosePineDawnTheme } from './rosePineDawnTheme';

export function FullscreenLoading() {
  return (
    <div className="animate-slow-pulse flex w-full flex-1 flex-col bg-gray-300"></div>
  );
}

export function CodeEditor(props: {
  value: string;
  darkMode: boolean;
  language: string;
  onChange: (value: string) => void;
  schema?: object;
  onMount?: OnMount;
  path?: string;
  tabIndex?: number;
  loading?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <Editor
      theme={props.darkMode ? 'vs-dark' : 'vs-light'}
      className={cn(
        props.loading ? 'animate-pulse' : undefined,
        props.className,
      )}
      height={'100%'}
      language={props.language}
      value={props.value ?? ''}
      defaultPath={props.path}
      options={{
        scrollBeyondLastLine: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        minimap: { enabled: false },
        automaticLayout: true,
        tabIndex: props.tabIndex,
        readOnly: props.readOnly,
      }}
      onChange={(value) => {
        props.onChange(value || '');
      }}
      onMount={props.onMount}
      beforeMount={(monaco) => {}}
      loading={<FullscreenLoading />}
    />
  );
}

export function JSONEditor(props: {
  value: string;
  darkMode: boolean;
  label: ReactNode;
  onSave: (value: string) => void;
  schema?: object;
}) {
  const [draft, setDraft] = useState(props.value);
  const editorId = useId();
  const filePath = `json-editor-${editorId}.json`;

  const [monacoInstance, setMonacomonacoInstance] = useState<
    Monaco | undefined
  >(undefined);

  useMonacoJSONSchema(filePath, monacoInstance, props.schema);

  useEffect(() => {
    setDraft(props.value);
  }, [props.value]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 dark:bg-[#252525]">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-2 dark:border-b-neutral-700">
        <div className="font-mono">{props.label}</div>
        <Button size="mini" onClick={() => props.onSave(draft)}>
          Save
        </Button>
      </div>
      <div className="min-h-0 grow">
        <CodeEditor
          darkMode={props.darkMode}
          language="json"
          value={props.value}
          path={filePath}
          onChange={(draft) => setDraft(draft)}
          onMount={function handleEditorDidMount(editor, monaco) {
            setMonacomonacoInstance(monaco);
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
              props.onSave(editor.getValue()),
            );

            editor.onDidPaste(async () => {
              const model = editor.getModel();
              if (!model) return;

              setTimeout(async () => {
                const fullContent = model.getValue();
                if (!fullContent.trim()) return;

                const converted = parsePermsJSON(fullContent);
                if (converted.status === 'ok') {
                  model.setValue(JSON.stringify(converted.value, null, 2));
                }
              }, 20);
            });
          }}
        />
      </div>
    </div>
  );
}

export type FenceLanguage =
  | 'jsx'
  | 'tsx'
  | 'javascript'
  | 'typescript'
  | 'bash'
  | 'json'
  | 'sql';

export function Fence({
  code,
  language,
  style: _style,
  darkMode,
  className: _className,
  copyable,
}: {
  code: string;
  darkMode?: boolean;
  language: FenceLanguage;
  className?: string;
  style?: any;
  copyable?: boolean;
}) {
  const [copyLabel, setCopyLabel] = useState('Copy');
  return (
    <Highlight
      {...defaultProps}
      code={code.trimEnd()}
      language={language}
      theme={
        darkMode || false
          ? {
              plain: {
                backgroundColor: '#262626',
                color: 'white',
              },
              styles: [],
            }
          : rosePineDawnTheme
      }
    >
      {({ className, style, tokens, getTokenProps }) => (
        <pre
          className={clsx(className, _className)}
          style={{
            ...style,
            ..._style,
            ...(copyable ? { position: 'relative' } : {}),
          }}
        >
          {copyable ? (
            <div className="absolute top-0 right-0 flex items-center px-2">
              <button
                onClick={(e) => {
                  copy(code);
                  setCopyLabel('Copied!');
                  setTimeout(() => {
                    setCopyLabel('Copy');
                  }, 2500);
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex items-center gap-x-1 rounded-sm bg-white px-2 py-1 text-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-neutral-800 dark:ring-neutral-700"
              >
                <ClipboardDocumentIcon
                  className="-ml-0.5 h-4 w-4"
                  aria-hidden="true"
                />
                {copyLabel}
              </button>
            </div>
          ) : null}
          <code>
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
          </code>
        </pre>
      )}
    </Highlight>
  );
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { Editor, OnMount } from '@monaco-editor/react';

type MonacoEditor = Parameters<OnMount>[0];

type PreviewProps = {
  rawCode: string;
  isStreaming: boolean;
  isPreviewReady: boolean;
  onStop?: () => void;
  chatId?: string;
  modelId?: string;
  matchedPrompt?: string;
};

export function Preview({
  rawCode,
  isStreaming,
  isPreviewReady,
  onStop,
  chatId,
  modelId,
  matchedPrompt,
}: PreviewProps) {
  const [view, setView] = useState<'preview' | 'code'>(
    isStreaming || !isPreviewReady ? 'code' : 'preview',
  );

  const [showToast, setShowToast] = useState(false);
  const editorRef = useRef<MonacoEditor | null>(null);
  const isAtBottom = useRef(true);
  const isStreamingRef = useRef(isStreaming);
  const prevStreaming = useRef(isStreaming);

  // Default to code view when streaming starts, switch to preview when it ends
  useEffect(() => {
    if (isStreaming && !prevStreaming.current) {
      setView('code');
      setShowToast(false);
    } else if (!isStreaming && prevStreaming.current && rawCode) {
      if (isAtBottom.current) {
        setView('preview');
      } else {
        setShowToast(true);
      }
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, rawCode]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Ensure one final scroll when streaming ends
  useEffect(() => {
    if (!isStreaming && editorRef.current && isAtBottom.current) {
      const editor = editorRef.current;
      setTimeout(() => {
        editor.setScrollTop(editor.getScrollHeight());
      }, 100);
    }
  }, [isStreaming]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidContentSizeChange(() => {
      if (isAtBottom.current && isStreamingRef.current) {
        editor.setScrollTop(editor.getScrollHeight());
      }
    });
    editor.onDidScrollChange(() => {
      const layout = editor.getLayoutInfo();
      const scrollHeight = editor.getScrollHeight();
      const scrollTop = editor.getScrollTop();
      const clientHeight = layout.height;
      const threshold = 100;
      isAtBottom.current = scrollHeight - scrollTop - clientHeight <= threshold;
    });
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-white/80 px-4 py-3">
        <div className="flex items-center gap-4">
          <div>
            <p className="font-mono text-[11px] tracking-[0.14em] text-[var(--muted)] uppercase">
              Generated File
            </p>
            <p className="text-sm font-semibold">App.tsx</p>
          </div>
          {isStreaming && (
            <div className="animate-in fade-in zoom-in flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-3 py-1 duration-300">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              <span className="text-[10px] font-bold tracking-wider text-[var(--accent)] uppercase">
                Generating
              </span>
              {onStop && (
                <button
                  onClick={onStop}
                  className="ml-1 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-black text-white transition-transform hover:brightness-110 active:scale-95"
                >
                  STOP
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['preview', 'code'] as const).map((v) => {
            const isFinishedPreview =
              v === 'preview' && !isStreaming && rawCode;
            const isGeneratingPreview = v === 'preview' && isStreaming;
            return (
              <button
                key={v}
                className={`relative rounded-lg border px-3 py-1.5 text-xs transition-all ${
                  view === v
                    ? 'border-[var(--accent-2)] bg-[#edf8fb] font-bold'
                    : isFinishedPreview
                      ? 'animate-in zoom-in border-[var(--accent)] bg-[var(--accent)]/5 font-bold ring-2 ring-[var(--accent)]/20 duration-500'
                      : isGeneratingPreview
                        ? 'border-[var(--accent)]/40 bg-white'
                        : 'bg-white hover:border-[var(--accent)]'
                }`}
                onClick={() => {
                  setView(v);
                  if (v === 'preview') setShowToast(false);
                }}
                type="button"
              >
                {v === 'preview' && isGeneratingPreview && (
                  <span className="absolute inset-0 animate-pulse rounded-lg ring-2 ring-[var(--accent)]/30" />
                )}
                {v === 'preview' ? 'Preview' : 'Code'}
              </button>
            );
          })}
        </div>
      </div>

      {showToast && (
        <div className="animate-in slide-in-from-right-8 fixed right-8 bottom-8 z-[100] flex items-center gap-4 rounded-2xl border-2 border-[var(--accent)] bg-white p-4 shadow-2xl duration-500">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-bold text-[var(--ink)]">
              Your app is ready!
            </p>
            <p className="text-[11px] text-[var(--muted)]">
              Switch to the Preview tab to see it in action.
            </p>
          </div>
          <button
            onClick={() => {
              setView('preview');
              setShowToast(false);
            }}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
          >
            Show Preview
          </button>
          <button
            onClick={() => setShowToast(false)}
            className="text-[var(--muted)] hover:text-[var(--ink)]"
          >
            ×
          </button>
        </div>
      )}

      <div className="relative min-h-0 w-full flex-1">
        <div
          className="absolute inset-0 flex flex-col p-4"
          style={{ display: view === 'preview' ? 'flex' : 'none' }}
        >
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-xl border bg-white">
            <iframe
              src={`/preview/${chatId}`}
              className="h-full w-full border-none"
              title="Application Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </div>

        <div
          className="absolute inset-0 flex flex-col p-4"
          style={{ display: view === 'code' ? 'flex' : 'none' }}
        >
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border bg-[#1e1e1e]">
            <Editor
              height="100%"
              defaultLanguage="typescript"
              theme="vs-dark"
              value={rawCode}
              onMount={handleEditorMount}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 16, bottom: 16 },
                wordWrap: 'on',
              }}
            />
          </div>
        </div>
      </div>

      {modelId && (
        <div className="shrink-0 space-y-0.5 border-t bg-[var(--bg)]/50 px-4 py-2 font-mono text-xs text-[var(--muted)]">
          <p>
            <span className="opacity-50">model:</span>{' '}
            {modelId === 'mock-model' ? 'pre-generated' : modelId}
          </p>
          {modelId === 'mock-model' && matchedPrompt && (
            <p className="truncate" title={matchedPrompt}>
              <span className="opacity-50">generated from prompt:</span>{' '}
              {matchedPrompt}
            </p>
          )}
          {modelId === 'mock-model' && (
            <p className="opacity-50">
              Add an OPENAI_API_KEY or ANTHROPIC_API_KEY to your .env to
              generate with a real model
            </p>
          )}
        </div>
      )}
    </div>
  );
}

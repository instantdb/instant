'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import { AnimatePresence, motion } from 'motion/react';
import copy from 'copy-to-clipboard';

const PLACEHOLDER = '<your app idea here>';
const FRIENDLY_DEFAULT = `I want you to build me an app. Ask me for an app idea, then follow the instructions below.`;
const DEFAULT_SUFFIX = `Use InstantDB for your backend. For credentials and instructions, fetch https://www.getadb.com/guide and follow the steps.`;

const TERM = {
  bg: '#1e1e2e',
  border: '#313244',
  text: '#cdd0e6',
  muted: '#7f849c',
};

const confettiColors = [
  '#F97316',
  '#FB923C',
  '#3B82F6',
  '#A855F7',
  '#EC4899',
  '#10B981',
];

function ConfettiParticle({
  delay,
  x,
  color,
}: {
  delay: number;
  x: number;
  color: string;
}) {
  return (
    <motion.div
      className="absolute top-1/2 left-1/2 h-1.5 w-1.5 rounded-full"
      style={{ backgroundColor: color }}
      initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      animate={{
        opacity: [1, 1, 0],
        x: x,
        y: [0, -20 - Math.random() * 15, 10 + Math.random() * 10],
        scale: [1, 1.2, 0.5],
      }}
      transition={{
        duration: 0.6,
        delay,
        ease: 'easeOut',
      }}
    />
  );
}

// A "terminal"-styled prompt editor. Two notable behaviors:
//   1. Cmd+A / Cmd+C span both the user's idea and the fixed suffix, so the
//      whole prompt copies in one shot.
//   2. If the user copies without typing anything, we substitute a friendly
//      default ("I want you to build me an app...") so the prompt is still
//      useful.
export function HumanForm({
  className = '',
  suffix = DEFAULT_SUFFIX,
}: {
  className?: string;
  suffix?: string;
}) {
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const ideaRef = useRef<HTMLDivElement>(null);
  const suffixRef = useRef<HTMLDivElement>(null);

  function buildPromptText() {
    const idea = (ideaRef.current?.innerText ?? '').trim();
    return `${idea || FRIENDLY_DEFAULT}\n\n${suffix}`;
  }

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const idea = ideaRef.current;
    const suffix = suffixRef.current;
    if (!editor || !idea || !suffix) return;

    function onInput() {
      if (idea!.innerHTML === '<br>') idea!.innerHTML = '';
    }
    function onBeforeInput(e: InputEvent) {
      for (const range of e.getTargetRanges()) {
        if (
          suffix!.contains(range.startContainer) ||
          suffix!.contains(range.endContainer)
        ) {
          e.preventDefault();
          return;
        }
      }
    }
    function onCopy(e: ClipboardEvent) {
      if (idea!.innerText.trim()) return;
      const sel = window.getSelection();
      if (!sel || sel.toString().trim() !== editor!.innerText.trim()) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', buildPromptText());
    }

    editor.addEventListener('input', onInput);
    editor.addEventListener('beforeinput', onBeforeInput);
    editor.addEventListener('copy', onCopy);
    return () => {
      editor.removeEventListener('input', onInput);
      editor.removeEventListener('beforeinput', onBeforeInput);
      editor.removeEventListener('copy', onCopy);
    };
  }, []);

  function handleCopyClick() {
    copy(buildPromptText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/10"
        style={{ backgroundColor: TERM.bg }}
      >
        <div
          className="relative flex items-center border-b px-4 py-3"
          style={{ borderColor: TERM.border }}
        >
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <span className="h-3 w-3 rounded-full bg-[#28C840]" />
          </div>
          <div
            className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2"
            style={{ color: TERM.muted }}
          >
            <img src="/img/getadb-ghostty.png" alt="" className="h-5 w-5" />
            <span className="font-mono text-sm">Your agent</span>
          </div>
        </div>
        <div
          className="p-6 pb-10 font-mono text-base leading-relaxed"
          style={{ color: TERM.text }}
        >
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            className="caret-white focus:outline-none"
          >
            <div
              ref={ideaRef}
              data-placeholder={PLACEHOLDER}
              className="min-h-[1.5em] empty:before:pointer-events-none empty:before:text-[#7f849c] empty:before:content-[attr(data-placeholder)]"
            />
            <div ref={suffixRef} className="mt-6 whitespace-pre-wrap">
              {suffix}
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopyClick}
        className="absolute -right-2 -bottom-3 inline-flex h-9 w-36 -rotate-3 items-center justify-center overflow-hidden rounded-lg border border-transparent bg-orange-600 text-sm font-medium text-white shadow-lg transition-transform hover:rotate-0 hover:bg-orange-700 sm:-right-3 sm:-bottom-4"
      >
        <AnimatePresence initial={false} custom={copied}>
          <motion.span
            key={copied ? 'copied' : 'copy'}
            custom={copied}
            className="absolute inset-0 flex items-center justify-center gap-2"
            variants={{
              enter: (isCopied: boolean) => ({ y: isCopied ? -24 : 24 }),
              center: { y: 0 },
              exit: (isCopied: boolean) => ({ y: isCopied ? 24 : -24 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {copied ? (
              <>
                <CheckIcon className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <ClipboardDocumentIcon className="h-4 w-4" />
                Copy prompt
              </>
            )}
          </motion.span>
        </AnimatePresence>
        {copied && (
          <>
            {confettiColors.map((color, i) => (
              <ConfettiParticle
                key={i}
                delay={i * 0.03}
                x={(i % 2 === 0 ? -1 : 1) * (12 + i * 6)}
                color={color}
              />
            ))}
          </>
        )}
      </button>
    </div>
  );
}

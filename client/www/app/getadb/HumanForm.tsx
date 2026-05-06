'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import { AnimatePresence, motion } from 'motion/react';
import CopyToClipboard from 'react-copy-to-clipboard';

const PLACEHOLDER = '<your app idea here>';
const SUFFIX = `Use InstantDB for your backend. For credentials and instructions, fetch http://www.getadb.com/guide and follow the steps.`;

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

export function HumanForm({ className = '' }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const [ideaText, setIdeaText] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const ideaRef = useRef<HTMLDivElement>(null);

  function buildPromptText() {
    return `${ideaText.trim() || PLACEHOLDER}\n\n${SUFFIX}`;
  }

  useEffect(() => {
    const editor = editorRef.current;
    const idea = ideaRef.current;
    if (!editor || !idea) return;
    const range = document.createRange();
    range.setStart(idea, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    editor.focus();
  }, []);

  function handleInput() {
    const idea = ideaRef.current;
    if (!idea) return;
    if (idea.innerHTML === '<br>') idea.innerHTML = '';
    setIdeaText(idea.innerText ?? '');
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
            onInput={handleInput}
            spellCheck={false}
            className="caret-white focus:outline-none"
          >
            <div
              ref={ideaRef}
              data-placeholder={PLACEHOLDER}
              className="min-h-[1.5em] empty:before:pointer-events-none empty:before:text-[#7f849c] empty:before:content-[attr(data-placeholder)]"
            />
            <div contentEditable={false} className="mt-6 whitespace-pre-wrap">
              {SUFFIX}
            </div>
          </div>
        </div>
      </div>
      <CopyToClipboard
        text={buildPromptText()}
        onCopy={() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <button
          type="button"
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
      </CopyToClipboard>
    </div>
  );
}

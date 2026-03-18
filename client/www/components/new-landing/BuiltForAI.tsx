'use client';
import { useState, useEffect, useRef } from 'react';
import { AnimateIn } from './AnimateIn';
import { motion, AnimatePresence } from 'motion/react';
import {
  FeatureBody,
  SectionIntro,
  SectionSubtitle,
  SectionTitle,
  Subheading,
} from './typography';
import { UndoDemo } from './UndoDemo';
import { TabbedCodeExample, CodePanel } from './TabbedCodeExample';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';

// Animated terminal showing `npx instant-cli push` with schema diff
type TerminalPhase =
  | 'idle'
  | 'typing'
  | 'found'
  | 'diff'
  | 'result'
  | 'cancelled'
  | 'pause';

const PUSH_COMMAND = 'npx instant-cli push schema';

export function AnimatedTerminal() {
  const [phase, setPhase] = useState<TerminalPhase>('idle');
  const [typingIndex, setTypingIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showFound = !['idle', 'typing'].includes(phase);
  const showDiff = !['idle', 'typing', 'found'].includes(phase);
  const showButtons = showDiff;

  // Start animation when the terminal scrolls into view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && phase === 'idle') {
          setPhase('typing');
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [phase]);

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, [phase]);

  useEffect(() => {
    if (phase === 'idle') return;

    if (phase === 'typing') {
      if (typingIndex < PUSH_COMMAND.length) {
        const timeout = setTimeout(
          () => setTypingIndex((i) => i + 1),
          8 + Math.random() * 16,
        );
        return () => clearTimeout(timeout);
      }
      const timeout = setTimeout(() => setPhase('found'), 300);
      return () => clearTimeout(timeout);
    }

    if (phase === 'found') {
      const timeout = setTimeout(() => setPhase('diff'), 500);
      return () => clearTimeout(timeout);
    }

    if (phase === 'diff') {
      // Wait for user to click Push or Cancel — don't auto-advance
      return;
    }

    if (phase === 'result' || phase === 'cancelled') {
      const timeout = setTimeout(() => setPhase('pause'), 3000);
      return () => clearTimeout(timeout);
    }

    if (phase === 'pause') {
      const timeout = setTimeout(() => {
        setPhase('typing');
        setTypingIndex(0);
      }, 60000);
      return () => clearTimeout(timeout);
    }
  }, [phase, typingIndex]);

  const handlePush = () => {
    if (phase === 'diff') {
      setPhase('result');
    }
  };

  const handleCancel = () => {
    if (phase === 'diff') {
      setPhase('cancelled');
    }
  };

  return (
    <div ref={containerRef}>
      <div
        className="overflow-hidden rounded-lg border border-gray-200"
        style={{ backgroundColor: c.bg }}
      >
        <div
          ref={scrollRef}
          className="h-[340px] overflow-y-auto p-4 font-mono text-sm sm:p-6"
        >
          {/* Command line */}
          <div className="flex items-center gap-2">
            <span style={{ color: c.keyword }}>$</span>
            <span style={{ color: c.text }}>
              {phase === 'typing' ? (
                <>
                  {PUSH_COMMAND.slice(0, typingIndex)}
                  <span
                    className="inline-block h-[0.85em] w-[0.5em] translate-y-[1px] animate-pulse"
                    style={{ backgroundColor: c.text }}
                  />
                </>
              ) : (
                PUSH_COMMAND
              )}
            </span>
          </div>

          {/* Found app ID */}
          {showFound && (
            <div className="mt-1" style={{ color: c.punctuation }}>
              Found{' '}
              <span
                className="rounded px-0.5"
                style={{
                  backgroundColor: `${c.keyword}20`,
                  color: c.keyword,
                }}
              >
                NEXT_PUBLIC_INSTANT_APP_ID
              </span>
              : a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a
            </div>
          )}

          {/* Schema diff box */}
          {showDiff && (
            <div
              className="mt-3 border px-3 py-2"
              style={{ borderColor: `${c.punctuation}40` }}
            >
              <div>
                <span
                  className="px-1.5 py-px text-white"
                  style={{ backgroundColor: c.keyword }}
                >
                  + CREATE NAMESPACE
                </span>
                <span className="ml-2" style={{ color: c.text }}>
                  todos
                </span>
              </div>
              <div className="mt-px space-y-px pl-2">
                <div style={{ color: c.keyword }}>+ CREATE ATTR todos.id</div>
                <div style={{ color: c.keyword }}>+ CREATE ATTR todos.text</div>
                <div className="pl-6" style={{ color: c.punctuation }}>
                  DATA TYPE: string
                </div>
              </div>
            </div>
          )}

          {/* Push prompt + buttons */}
          {showButtons && (
            <div className="mt-3">
              <div style={{ color: c.text }}>Push these changes?</div>
              <div className="mt-1.5 flex gap-4">
                <button
                  onClick={handlePush}
                  className="cursor-pointer px-3 py-0.5 text-white"
                  style={{ backgroundColor: c.string }}
                >
                  Push
                </button>
                <button
                  onClick={handleCancel}
                  className="cursor-pointer border px-3 py-0.5"
                  style={{
                    borderColor: `${c.punctuation}60`,
                    color: c.punctuation,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Result */}
          {phase === 'cancelled' && (
            <div className="mt-2">
              <div style={{ color: c.punctuation }}>
                Schema migration cancelled!
              </div>
            </div>
          )}
          {(phase === 'result' || phase === 'pause') && (
            <div className="mt-2">
              <div style={{ color: c.keyword }}>Schema updated!</div>
              <div style={{ color: c.keyword }}>✓ Done</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Type safety visualization

function BlinkingCursor() {
  return (
    <motion.span
      className="inline-block h-[1.1em] w-[2px] translate-y-[2px]"
      style={{ backgroundColor: c.text }}
      animate={{ opacity: [1, 0] }}
      transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
    />
  );
}

type DropdownItem = {
  icon: string;
  iconColor: string;
  name: string;
  type: string;
  highlighted?: boolean;
};

function AutocompleteDropdown({ items }: { items: DropdownItem[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full left-0 z-10 mt-1 min-w-[220px] overflow-hidden rounded-md border border-gray-200 shadow-xl"
      style={{ backgroundColor: c.bg }}
    >
      {items.map((item) => (
        <div
          key={item.name}
          className={`flex items-center gap-2 px-3 py-1.5 text-[13px] ${
            item.highlighted
              ? 'border-l-2 bg-blue-50'
              : 'border-l-2 border-l-transparent'
          }`}
          style={item.highlighted ? { borderLeftColor: c.keyword } : undefined}
        >
          <span style={{ color: item.iconColor }}>◆</span>
          <span style={{ color: c.text }}>{item.name}</span>
          <span className="ml-auto" style={{ color: c.punctuation }}>
            {item.type}
          </span>
        </div>
      ))}
    </motion.div>
  );
}

type Phase =
  | 'typing-prefix'
  | 'show-dropdown'
  | 'select-item'
  | 'show-annotation'
  | 'pause';

type Scene = {
  prefix: React.ReactNode;
  dropdownItems: DropdownItem[];
  selectedText: string;
  suffix: string;
  annotation: string;
};

const scenes: Scene[] = [
  {
    prefix: (
      <>
        <span style={{ color: c.value }}>db</span>
        <span style={{ color: c.punctuation }}>.</span>
        <span style={{ color: c.value }}>useQuery</span>
        <span style={{ color: c.punctuation }}>{'({'}</span>
      </>
    ),
    dropdownItems: [
      {
        icon: '◆',
        iconColor: c.parameter,
        name: 'messages',
        type: 'EntityDef',
        highlighted: true,
      },
      {
        icon: '◆',
        iconColor: c.tag,
        name: 'users',
        type: 'EntityDef',
      },
      {
        icon: '◆',
        iconColor: c.keyword,
        name: 'channels',
        type: 'EntityDef',
      },
    ],
    selectedText: ' messages: {} ',
    suffix: '})',
    annotation: '// → { messages: Message[] }',
  },
  {
    prefix: (
      <>
        <span style={{ color: c.tag }}>data</span>
        <span style={{ color: c.punctuation }}>.</span>
        <span style={{ color: c.tag }}>messages</span>
        <span style={{ color: c.punctuation }}>[</span>
        <span style={{ color: c.value }}>0</span>
        <span style={{ color: c.punctuation }}>].</span>
      </>
    ),
    dropdownItems: [
      {
        icon: '◆',
        iconColor: c.keyword,
        name: 'text',
        type: 'string',
        highlighted: true,
      },
      { icon: '◆', iconColor: c.tag, name: 'id', type: 'string' },
      {
        icon: '◆',
        iconColor: c.parameter,
        name: 'createdAt',
        type: 'number',
      },
    ],
    selectedText: 'text',
    suffix: '',
    annotation: '// → string',
  },
];

export function TypeSafetyDemo() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('typing-prefix');

  const scene = scenes[sceneIndex];

  useEffect(() => {
    let delay: number;
    switch (phase) {
      case 'typing-prefix':
        delay = 800;
        break;
      case 'show-dropdown':
        delay = 1200;
        break;
      case 'select-item':
        delay = 800;
        break;
      case 'show-annotation':
        delay = 2000;
        break;
      case 'pause':
        delay = 2000;
        break;
      default:
        delay = 1000;
    }

    const timeout = setTimeout(() => {
      switch (phase) {
        case 'typing-prefix':
          setPhase('show-dropdown');
          break;
        case 'show-dropdown':
          setPhase('select-item');
          break;
        case 'select-item':
          setPhase('show-annotation');
          break;
        case 'show-annotation':
          setPhase('pause');
          break;
        case 'pause':
          setSceneIndex((i) => (i + 1) % scenes.length);
          setPhase('typing-prefix');
          break;
      }
    }, delay);

    return () => clearTimeout(timeout);
  }, [phase, sceneIndex]);

  const showDropdown = phase === 'show-dropdown';
  const showSelected =
    phase === 'select-item' || phase === 'show-annotation' || phase === 'pause';
  const showAnnotation = phase === 'show-annotation' || phase === 'pause';
  const showCursor = phase !== 'pause';

  return (
    <CodePanel tabs={[{ key: 'app', label: 'app.tsx' }]} activeTab="app">
      <div className="min-h-[160px] p-5 font-mono text-sm sm:p-6 sm:text-[15px]">
        {/* Code line */}
        <div className="relative inline-flex flex-wrap items-center whitespace-pre">
          {scene.prefix}
          {showSelected && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ color: c.tag }}
            >
              {scene.selectedText}
            </motion.span>
          )}
          {showCursor && !showSelected && <BlinkingCursor />}
          {showSelected && (
            <span style={{ color: c.punctuation }}>{scene.suffix}</span>
          )}
          {showSelected && showCursor && <BlinkingCursor />}

          {/* Dropdown */}
          <AnimatePresence>
            {showDropdown && (
              <AutocompleteDropdown items={scene.dropdownItems} />
            )}
          </AnimatePresence>
        </div>

        {/* Type annotation */}
        <AnimatePresence>
          {showAnnotation && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ color: c.punctuation }}
              className="mt-3"
            >
              {scene.annotation}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </CodePanel>
  );
}

const chatCode = `// ༼ つ ◕_◕ ༽つ Real-time Chat
// ----------------------------------
// * Updates instantly
// * Multiplayer
// * Works offline

import { init, id } from "@instantdb/react"

const db = init({ appId: "your-app-id" })

function Chat() {
  // 1. Read
  const { data } = db.useQuery({ messages: {} })

  // 2. Write
  const addMessage = (msg) => {
    db.transact(db.tx.messages[id()].update(msg))
  }

  // 3. Render!
  return <UI data={data} onAdd={addMessage} />
}

export default Chat`;

const schemaCode = `// Declarative data model
// ----------------------------------

import { i } from "@instantdb/core"

const schema = i.schema({
  entities: {
    messages: i.entity({
      text: i.string(),
      createdAt: i.date(),
    }),
  },
})

export default schema`;

const permsCode = `// Declarative rules
// ----------------------------------

const rules = {
  messages: {
    bind: { "isOwner": "auth.id == data.creator" },

    allow: {
      read: "true",    // Anyone can read
      create: "isOwner", // Only owner
      update: "isOwner", // Only owner
      delete: "isOwner", // Only owner
    }
  }
}

export default rules`;

export function BuiltForAI() {
  return (
    <div className="space-y-24">
      {/* Section header */}
      <AnimateIn>
        <SectionIntro>
          <SectionTitle>Built for AI</SectionTitle>
          <SectionSubtitle>
            Get a backend designed to be operated from the CLI. Your agent can
            do everything a human can do with a dashboard, and when things go
            wrong, undo is built in.
          </SectionSubtitle>
        </SectionIntro>
      </AnimateIn>

      {/* Feature 1: CLI-first - the hero visual */}
      <AnimateIn>
        <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
          <div className="md:max-w-[400px]">
            <Subheading>Never leave your terminal</Subheading>
            <FeatureBody>
              Create an account, spin up a database, push schema, and build from
              the terminal. No dashboards. No clicking through UIs. Just you,
              your agent, and your code.
            </FeatureBody>
          </div>
          <div className="grow lg:bg-[#CC4E05]/20 lg:px-[66px] lg:py-[37px]">
            <div className="mx-auto max-w-[420px]">
              <AnimatedTerminal />
            </div>
          </div>
        </div>
      </AnimateIn>

      {/* Feature 2: LLMs get it right */}
      <AnimateIn>
        <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row lg:items-center">
          <div className="lg:bg-surface/20 grow lg:px-[66px] lg:py-[37px]">
            <TabbedCodeExample
              examples={[
                {
                  label: 'Chat App',
                  chat: chatCode,
                  schema: schemaCode,
                  perms: permsCode,
                },
              ]}
              tabs={[
                { key: 'chat', label: 'chat.tsx', language: 'tsx' },
                { key: 'schema', label: 'schema.ts', language: 'typescript' },
                { key: 'perms', label: 'perms.ts', language: 'javascript' },
              ]}
              height="h-[560px]"
            />
          </div>
          <div className="lg:max-w-[440px]">
            <Subheading>Easy for humans, perfect for LLMs</Subheading>
            <FeatureBody>
              Instant has a tiny API surface. Modern LLMs already know it from
              their training data. And it takes only 1% of context for advanced
              features.
            </FeatureBody>
            <FeatureBody>
              Here's how a real-time chat app looks like with Instant. Simple to
              read, and even easier for your AI to understand and generate.
            </FeatureBody>
          </div>
        </div>
      </AnimateIn>

      {/* Feature 3: Type safety */}
      <AnimateIn>
        <div className="flex flex-col items-stretch gap-7 md:flex-row md:items-center">
          <div className="md:max-w-[440px]">
            <Subheading>End-to-end type safety</Subheading>
            <FeatureBody>
              Instant comes with types for your schema, permissions, queries,
              and transactions. This makes it easy to catch errors early. Your
              AI can understand your data model and generate correct code on the
              first try.
            </FeatureBody>
          </div>
          <div className="lg:bg-surface/20 grow lg:px-[66px] lg:py-[37px]">
            <TypeSafetyDemo />
          </div>
        </div>
      </AnimateIn>

      {/* Feature 4: Undo destructive changes */}
      <AnimateIn>
        <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center lg:gap-12">
          <div className="grow lg:bg-[#CC4E05]/10 lg:px-[66px] lg:py-[37px]">
            <UndoDemo />
          </div>
          <div className="md:max-w-[400px]">
            <Subheading>Undo destructive changes</Subheading>
            <FeatureBody>
              LLMs can make mistakes. For destructive actions like schema
              deletions, Instant comes with built-in undo. Restore deleted
              columns instantly.
            </FeatureBody>
          </div>
        </div>
      </AnimateIn>
    </div>
  );
}

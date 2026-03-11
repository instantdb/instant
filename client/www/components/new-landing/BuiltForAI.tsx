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

function AnimatedTerminal() {
  const [phase, setPhase] = useState<TerminalPhase>('idle');
  const [typingIndex, setTypingIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showFound = !['idle', 'typing'].includes(phase);
  const showDiff = !['idle', 'typing', 'found'].includes(phase);
  const showButtons = showDiff;
  const showResult =
    phase === 'result' || phase === 'cancelled' || phase === 'pause';

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
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl"
    >
      <div
        ref={scrollRef}
        className="h-[340px] overflow-y-auto p-4 font-mono text-sm sm:p-6"
      >
        {/* Command line */}
        <div className="flex items-center gap-2">
          <span className="text-green-400">$</span>
          <span className="text-gray-100">
            {phase === 'typing' ? (
              <>
                {PUSH_COMMAND.slice(0, typingIndex)}
                <span className="inline-block h-[0.85em] w-[0.5em] translate-y-[1px] animate-pulse bg-gray-100/70" />
              </>
            ) : (
              PUSH_COMMAND
            )}
          </span>
        </div>

        {/* Found app ID */}
        {showFound && (
          <div className="mt-1 text-gray-400">
            Found{' '}
            <span className="bg-green-900/60 px-0.5 text-green-300">
              NEXT_PUBLIC_INSTANT_APP_ID
            </span>
            : a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a
          </div>
        )}

        {/* Schema diff box */}
        {showDiff && (
          <div className="mt-3 border border-gray-700 px-3 py-2">
            <div>
              <span className="bg-green-600 px-1.5 py-px text-white">
                + CREATE NAMESPACE
              </span>
              <span className="ml-2 text-gray-300">todos</span>
            </div>
            <div className="mt-1.5 space-y-px pl-2">
              <div className="text-green-400">+ CREATE ATTR todos.id</div>
              <div className="text-green-400">+ CREATE ATTR todos.text</div>
              <div className="pl-6 text-gray-500">DATA TYPE: string</div>
            </div>
          </div>
        )}

        {/* Push prompt + buttons */}
        {showButtons && (
          <div className="mt-3">
            <div className="text-gray-300">Push these changes?</div>
            <div className="mt-1.5 flex gap-4">
              <button
                onClick={handlePush}
                className="cursor-pointer bg-amber-600 px-3 py-0.5 text-white"
              >
                Push
              </button>
              <button
                onClick={handleCancel}
                className="cursor-pointer bg-gray-700 px-3 py-0.5 text-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Result */}
        {phase === 'cancelled' && (
          <div className="mt-2">
            <div className="text-gray-400">Schema migration cancelled!</div>
          </div>
        )}
        {(phase === 'result' || phase === 'pause') && (
          <div className="mt-2">
            <div className="text-green-400">Schema updated!</div>
            <div className="text-green-400">✓ Done</div>
          </div>
        )}
      </div>
    </div>
  );
}

// Full chat example with tabs for code, schema, and permissions
function InstantCodeSnippet() {
  const [activeTab, setActiveTab] = useState<'chat' | 'schema' | 'perms'>(
    'chat',
  );

  const tabs = [
    { id: 'chat' as const, label: 'chat.tsx' },
    { id: 'schema' as const, label: 'schema.ts' },
    { id: 'perms' as const, label: 'perms.ts' },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800 bg-gray-900">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-mono text-xs transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-orange-500 bg-gray-950 text-gray-100'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Code content */}
      <div className="h-[500px] p-4 font-mono text-xs sm:text-sm">
        {activeTab === 'chat' && <ChatCode />}
        {activeTab === 'schema' && <SchemaCode />}
        {activeTab === 'perms' && <PermsCode />}
      </div>
    </div>
  );
}

function ChatCode() {
  return (
    <>
      <div className="text-gray-400">// ༼ つ ◕_◕ ༽つ Real-time Chat</div>
      <div className="text-gray-400">// ----------------------------------</div>
      <div className="text-gray-400">// * Updates instantly</div>
      <div className="text-gray-400">// * Multiplayer</div>
      <div className="text-gray-400">// * Works offline</div>

      <div className="mt-4">
        <span className="text-purple-400">import</span>
        <span className="text-gray-400">{' { '}</span>
        <span className="text-blue-300">init</span>
        <span className="text-gray-400">, </span>
        <span className="text-blue-300">id</span>
        <span className="text-gray-400">{' } '}</span>
        <span className="text-purple-400">from</span>
        <span className="text-emerald-300"> "@instantdb/react"</span>
      </div>

      <div className="mt-3">
        <span className="text-purple-400">const</span>
        <span className="text-blue-300"> db </span>
        <span className="text-gray-400">= </span>
        <span className="text-yellow-300">init</span>
        <span className="text-gray-400">{`({`}</span>
        <span className="text-blue-300">appId</span>
        <span className="text-gray-400">: </span>
        <span className="text-emerald-300">"your-app-id"</span>
        <span className="text-gray-400">{' })'}</span>
      </div>

      <div className="mt-3">
        <span className="text-purple-400">function</span>
        <span className="text-yellow-300"> Chat</span>
        <span className="text-gray-400">() {'{'}</span>
      </div>

      <div className="mt-1 pl-4 text-gray-400">// 1. Read</div>
      <div className="pl-4">
        <span className="text-purple-400">const</span>
        <span className="text-gray-400">{' { '}</span>
        <span className="text-blue-300">data</span>
        <span className="text-gray-400">{' } = '}</span>
        <span className="text-orange-300">db</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">useQuery</span>
        <span className="text-gray-400">{'({ '}</span>
        <span className="text-blue-300">messages</span>
        <span className="text-gray-400">{': {} })'}</span>
      </div>

      <div className="mt-3 pl-4 text-gray-400">// 2. Write</div>
      <div className="pl-4">
        <span className="text-purple-400">const</span>
        <span className="text-blue-300"> addMessage </span>
        <span className="text-gray-400">= (</span>
        <span className="text-orange-300">msg</span>
        <span className="text-gray-400">) =&gt; {'{'}</span>
      </div>
      <div className="pl-8">
        <span className="text-orange-300">db</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">transact</span>
        <span className="text-gray-400">(</span>
        <span className="text-orange-300">db</span>
        <span className="text-gray-400">.</span>
        <span className="text-blue-300">tx</span>
        <span className="text-gray-400">.</span>
        <span className="text-blue-300">messages</span>
        <span className="text-gray-400">[</span>
        <span className="text-yellow-300">id</span>
        <span className="text-gray-400">()].</span>
        <span className="text-yellow-300">update</span>
        <span className="text-gray-400">(</span>
        <span className="text-orange-300">msg</span>
        <span className="text-gray-400">))</span>
      </div>
      <div className="pl-4">
        <span className="text-gray-400">{'}'}</span>
      </div>

      <div className="mt-3 pl-4 text-gray-400">// 3. Render!</div>
      <div className="pl-4">
        <span className="text-purple-400">return</span>
        <span className="text-gray-400"> &lt;</span>
        <span className="text-blue-300">UI</span>
        <span className="text-blue-300"> data</span>
        <span className="text-gray-400">=</span>
        <span className="text-gray-400">{'{data}'}</span>
        <span className="text-blue-300"> onAdd</span>
        <span className="text-gray-400">=</span>
        <span className="text-gray-400">{'{addMessage}'}</span>
        <span className="text-gray-400"> /&gt;</span>
      </div>

      <div>
        <span className="text-gray-400">{'}'}</span>
      </div>

      <div className="mt-3">
        <span className="text-purple-400">export</span>
        <span className="text-purple-400"> default</span>
        <span className="text-blue-300"> Chat</span>
      </div>
    </>
  );
}

function SchemaCode() {
  return (
    <>
      <div className="text-gray-400">// Declarative data model</div>
      <div className="text-gray-400">// ----------------------------------</div>
      <div className="mt-4">
        <span className="text-purple-400">import</span>
        <span className="text-gray-400">{' { '}</span>
        <span className="text-blue-300">i</span>
        <span className="text-gray-400">{' } '}</span>
        <span className="text-purple-400">from</span>
        <span className="text-emerald-300"> "@instantdb/core"</span>
      </div>

      <div className="mt-3">
        <span className="text-purple-400">const</span>
        <span className="text-blue-300"> schema </span>
        <span className="text-gray-400">= </span>
        <span className="text-orange-300">i</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">schema</span>
        <span className="text-gray-400">({'{'}</span>
      </div>

      <div className="pl-4">
        <span className="text-blue-300">entities</span>
        <span className="text-gray-400">: {'{'}</span>
      </div>

      <div className="pl-8">
        <span className="text-blue-300">messages</span>
        <span className="text-gray-400">: </span>
        <span className="text-orange-300">i</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">entity</span>
        <span className="text-gray-400">({'{'}</span>
      </div>

      <div className="pl-12">
        <span className="text-blue-300">text</span>
        <span className="text-gray-400">: </span>
        <span className="text-orange-300">i</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">string</span>
        <span className="text-gray-400">(),</span>
      </div>

      <div className="pl-12">
        <span className="text-blue-300">createdAt</span>
        <span className="text-gray-400">: </span>
        <span className="text-orange-300">i</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">date</span>
        <span className="text-gray-400">(),</span>
      </div>

      <div className="pl-8">
        <span className="text-gray-400">{'})'}</span>
        <span className="text-gray-400">,</span>
      </div>

      <div className="pl-4">
        <span className="text-gray-400">{'}'}</span>
        <span className="text-gray-400">,</span>
      </div>

      <div>
        <span className="text-gray-400">{'})'}</span>
      </div>

      <div className="mt-4">
        <span className="text-purple-400">export</span>
        <span className="text-purple-400"> default</span>
        <span className="text-blue-300"> schema</span>
      </div>
    </>
  );
}

function PermsCode() {
  return (
    <>
      <div className="text-gray-400">// Declarative rules</div>
      <div className="text-gray-400">// ----------------------------------</div>

      <div className="mt-4">
        <span className="text-purple-400">const</span>
        <span className="text-blue-300"> rules </span>
        <span className="text-gray-400">= {'{'}</span>
      </div>

      <div className="pl-4">
        <span className="text-blue-300">messages</span>
        <span className="text-gray-400">: {'{'}</span>
      </div>

      <div className="pl-8">
        <span className="text-blue-300">bind</span>
        <span className="text-gray-400">{': {'}</span>
        <span className="text-emerald-300">"isOwner"</span>
        <span className="text-gray-400">: </span>
        <span className="text-emerald-300">"auth.id == data.creator"</span>
        <span className="text-gray-400">{'},'}</span>
      </div>

      <div className="mt-2 pl-8">
        <span className="text-blue-300">allow</span>
        <span className="text-gray-400">: {'{'}</span>
      </div>

      <div className="pl-12">
        <span className="text-blue-300">read</span>
        <span className="text-gray-400">: </span>
        <span className="text-emerald-300">"true"</span>
        <span className="text-gray-400">,</span>
        <span className="ml-4 text-gray-400">// Anyone can read</span>
      </div>

      <div className="pl-12">
        <span className="text-blue-300">create</span>
        <span className="text-gray-400">: </span>
        <span className="text-emerald-300">"isOwner"</span>
        <span className="text-gray-400">,</span>
        <span className="ml-4 text-gray-400">// Only owner</span>
      </div>

      <div className="pl-12">
        <span className="text-blue-300">update</span>
        <span className="text-gray-400">: </span>
        <span className="text-emerald-300">"isOwner"</span>
        <span className="text-gray-400">,</span>
        <span className="ml-4 text-gray-400">// Only owner</span>
      </div>

      <div className="pl-12">
        <span className="text-blue-300">delete</span>
        <span className="text-gray-400">: </span>
        <span className="text-emerald-300">"isOwner"</span>
        <span className="text-gray-400">,</span>
        <span className="ml-4 text-gray-400">// Only owner</span>
      </div>

      <div className="pl-8">
        <span className="text-gray-400">{'}'}</span>
      </div>

      <div className="pl-4">
        <span className="text-gray-400">{'}'}</span>
      </div>

      <div>
        <span className="text-gray-400">{'}'}</span>
      </div>

      <div className="mt-4">
        <span className="text-purple-400">export</span>
        <span className="text-purple-400"> default</span>
        <span className="text-blue-300"> rules</span>
      </div>
    </>
  );
}

// Type safety visualization

function BlinkingCursor() {
  return (
    <motion.span
      className="inline-block h-[1.1em] w-[2px] translate-y-[2px] bg-gray-300"
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
      className="absolute top-full left-0 z-10 mt-1 min-w-[220px] overflow-hidden rounded-md border border-gray-700 bg-[#1e1e2e] shadow-xl"
    >
      {items.map((item) => (
        <div
          key={item.name}
          className={`flex items-center gap-2 px-3 py-1.5 text-[13px] ${
            item.highlighted
              ? 'border-l-2 border-l-blue-400 bg-blue-500/15'
              : 'border-l-2 border-l-transparent'
          }`}
        >
          <span className={item.iconColor}>◆</span>
          <span className="text-gray-100">{item.name}</span>
          <span className="ml-auto text-gray-500">{item.type}</span>
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
        <span className="text-orange-300">db</span>
        <span className="text-gray-400">.</span>
        <span className="text-yellow-300">useQuery</span>
        <span className="text-gray-400">{'({'}</span>
      </>
    ),
    dropdownItems: [
      {
        icon: '◆',
        iconColor: 'text-purple-400',
        name: 'messages',
        type: 'EntityDef',
        highlighted: true,
      },
      {
        icon: '◆',
        iconColor: 'text-blue-400',
        name: 'users',
        type: 'EntityDef',
      },
      {
        icon: '◆',
        iconColor: 'text-emerald-400',
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
        <span className="text-blue-300">data</span>
        <span className="text-gray-400">.</span>
        <span className="text-blue-300">messages</span>
        <span className="text-gray-400">[</span>
        <span className="text-orange-300">0</span>
        <span className="text-gray-400">].</span>
      </>
    ),
    dropdownItems: [
      {
        icon: '◆',
        iconColor: 'text-emerald-400',
        name: 'text',
        type: 'string',
        highlighted: true,
      },
      { icon: '◆', iconColor: 'text-blue-400', name: 'id', type: 'string' },
      {
        icon: '◆',
        iconColor: 'text-purple-400',
        name: 'createdAt',
        type: 'number',
      },
    ],
    selectedText: 'text',
    suffix: '',
    annotation: '// → string',
  },
];

function TypeSafetyDemo() {
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
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl">
      {/* Editor title bar */}
      <div className="flex items-center border-b border-gray-800 bg-gray-900 px-4 py-2">
        <span className="font-mono text-xs text-gray-500">app.tsx</span>
      </div>

      <div className="min-h-[160px] p-5 font-mono text-sm sm:p-6 sm:text-[15px]">
        {/* Code line */}
        <div className="relative inline-flex flex-wrap items-center whitespace-pre">
          {scene.prefix}
          {showSelected && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-blue-300"
            >
              {scene.selectedText}
            </motion.span>
          )}
          {showCursor && !showSelected && <BlinkingCursor />}
          {showSelected && (
            <span className="text-gray-400">{scene.suffix}</span>
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
              className="mt-3 text-gray-500"
            >
              {scene.annotation}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

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
        <div className="flex items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="max-w-[400px]">
            <Subheading>Never leave your terminal</Subheading>
            <FeatureBody>
              Create an account, spin up a database, push schema, and build from
              the terminal. No dashboards. No clicking through UIs. Just you,
              your agent, and your code.
            </FeatureBody>
          </div>
          <div className="order-2 grow bg-[#CC4E05]/20 px-[129px] py-[96px] lg:order-1">
            <AnimatedTerminal />
          </div>
        </div>
      </AnimateIn>

      {/* Feature 2: LLMs get it right */}
      <AnimateIn>
        <div className="flex items-center gap-8">
          <div className="bg-surface/20 grow px-[66px] py-[37px]">
            <InstantCodeSnippet />
          </div>
          <div className="max-w-[440px]">
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
        <div className="flex items-center gap-7">
          <div className="max-w-[440px]">
            <Subheading>End-to-end type safety</Subheading>
            <FeatureBody>
              Instant comes with types for your schema, permissions, queries,
              and transactions. This makes it easy to catch errors early. Your
              AI can understand your data model and generate correct code on the
              first try.
            </FeatureBody>
          </div>
          <div className="bg-surface/20 grow px-[66px] py-[37px]">
            <TypeSafetyDemo />
          </div>
        </div>
      </AnimateIn>

      {/* Feature 4: Undo destructive changes */}
      <AnimateIn>
        <div className="flex items-center gap-8 lg:gap-12">
          <div className="grow bg-[#CC4E05]/10 px-[66px] py-[37px]">
            <UndoDemo />
          </div>
          <div className="max-w-[400px]">
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

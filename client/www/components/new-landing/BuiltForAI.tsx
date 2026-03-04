'use client';
import { useState, useEffect } from 'react';
import { AnimateIn } from './AnimateIn';
import { motion, AnimatePresence } from 'motion/react';

// Animated terminal that types out commands character by character
function AnimatedTerminal() {
  const steps = [
    { type: 'command' as const, text: 'npx instant-cli login' },
    { type: 'output' as const, text: 'Successfully logged in as joe@instantdb.com!' },
    { type: 'command' as const, text: 'npx create-instant-app awesome-gram' },
    { type: 'output' as const, text: '🎉 Success! Your project is ready to go!' },
    { type: 'command' as const, text: 'npx instant-cli push schema' },
    { type: 'output' as const, text: 'Schema updated!' },
    { type: 'command' as const, text: 'npx vercel --prod' },
    { type: 'output' as const, text: '✓ App deployed at https://awesome-gram.vercel.app' },
  ];

  // completedSteps: number of fully rendered steps
  // typingIndex: characters typed so far in the current command
  const [completedSteps, setCompletedSteps] = useState(0);
  const [typingIndex, setTypingIndex] = useState(0);

  const currentStep = completedSteps < steps.length ? steps[completedSteps] : null;
  const isTypingCommand = currentStep?.type === 'command';

  useEffect(() => {
    if (completedSteps >= steps.length) {
      // All done — pause then restart
      const timeout = setTimeout(() => {
        setCompletedSteps(0);
        setTypingIndex(0);
      }, 6000);
      return () => clearTimeout(timeout);
    }

    const step = steps[completedSteps];

    if (step.type === 'output') {
      // Outputs appear instantly after a short pause
      const timeout = setTimeout(() => {
        setCompletedSteps((s) => s + 1);
        setTypingIndex(0);
      }, 400);
      return () => clearTimeout(timeout);
    }

    // Command: type character by character
    if (typingIndex < step.text.length) {
      const timeout = setTimeout(() => {
        setTypingIndex((i) => i + 1);
      }, 8 + Math.random() * 16);
      return () => clearTimeout(timeout);
    }

    // Command fully typed — brief pause then advance
    const timeout = setTimeout(() => {
      setCompletedSteps((s) => s + 1);
      setTypingIndex(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [completedSteps, typingIndex, steps.length]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl">
      <div className="min-h-[300px] p-4 font-mono text-sm sm:p-6">
        {/* Already-completed steps */}
        {steps.slice(0, completedSteps).map((s, i) => (
          <div key={i} className={`${i > 0 ? 'mt-1' : ''}`}>
            {s.type === 'command' && (
              <div className="flex items-center gap-2">
                <span className="text-green-400">$</span>
                <span className="text-gray-100">{s.text}</span>
              </div>
            )}
            {s.type === 'output' && (
              <div
                className={`${s.text.startsWith('✓') ? 'text-green-400' : 'text-gray-400'}`}
              >
                {s.text}
              </div>
            )}
          </div>
        ))}

        {/* Currently typing command */}
        {isTypingCommand && currentStep && (
          <div className={`${completedSteps > 0 ? 'mt-1' : ''} flex items-center gap-2`}>
            <span className="text-green-400">$</span>
            <span className="text-gray-100">
              {currentStep.text.slice(0, typingIndex)}
              <span className="inline-block h-[0.85em] w-[0.5em] translate-y-[1px] animate-pulse bg-gray-100/70" />
            </span>
          </div>
        )}

        {/* Waiting cursor before output appears */}
        {currentStep?.type === 'output' && (
          <div className={`${completedSteps > 0 ? 'mt-1' : ''}`}>
            <span className="inline-block h-[1em] w-[2px] animate-pulse bg-gray-400" />
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
        <span className="text-gray-400">({'{ '}</span>
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
        <span className="text-gray-400">: [</span>
        <span className="text-emerald-300">"isOwner"</span>
        <span className="text-gray-400">, </span>
        <span className="text-emerald-300">"auth.id == data.creatorId"</span>
        <span className="text-gray-400">],</span>
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
        <span className="text-emerald-300">"auth.id != null"</span>
        <span className="text-gray-400">,</span>
        <span className="ml-4 text-gray-400">
          // Logged-in users can create
        </span>
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
      className="absolute left-0 top-full z-10 mt-1 min-w-[220px] overflow-hidden rounded-md border border-gray-700 bg-[#1e1e2e] shadow-xl"
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
        <span className="text-gray-400">({"{"}</span>
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
    selectedText: 'messages: {}',
    suffix: ' })',
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
  const showSelected = phase === 'select-item' || phase === 'show-annotation' || phase === 'pause';
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
        <div className="relative inline-flex flex-wrap items-center">
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
        <div className="sm:text-center">
          <h2 className="text-off-black text-2xl font-semibold sm:text-5xl">
            Built for AI
          </h2>
          <p className="mt-4 max-w-2xl text-[21px] sm:mx-auto">
            Instant is fully type-safe and supports a CLI-first workflow.
            Schema, permissions, queries, and transactions are all defined in
            code. No need to navigate UIs or dashboards. Go further and faster
            when you pair your AI with Instant.
          </p>
        </div>
      </AnimateIn>

      {/* Feature 1: CLI-first - the hero visual */}
      <AnimateIn>
        <div className="flex items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="max-w-[400px]">
            <h3 className="text-2xl font-semibold sm:text-2xl">
              Never leave your terminal
            </h3>
            <p className="mt-4 text-lg">
              Create an account, spin up a database, push schema, and build from
              the terminal. No dashboards. No clicking through UIs. Just you (or
              your AI) and the code.
            </p>
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
            <h3 className="text-2xl font-semibold sm:text-2xl">
              Easy for humans, perfect for LLMs
            </h3>
            <p className="mt-4 text-lg">
              Instant has a tiny API surface. Modern LLMs already know it from
              their training data. And it takes only 1% of context for advanced
              features.
            </p>
            <p className="mt-4 text-lg">
              Here's how a real-time chat app looks in Instant. Simple to read,
              and even easier for your AI to understand and generate.
            </p>
          </div>
        </div>
      </AnimateIn>

      {/* Feature 3: Type safety */}
      <AnimateIn>
        <div className="flex items-center gap-7">
          <div className="max-w-[440px]">
            <h3 className="text-2xl font-semibold sm:text-2xl">
              End-to-end type safety
            </h3>
            <p className="mt-4 text-lg">
              Instant comes with types for your schema, permissions, queries,
              and transactions. This makes it easy to catch errors early and for
              your AI to understand your data model and generate correct code on
              the first try.
            </p>
          </div>
          <div className="bg-surface/20 grow px-[66px] py-[37px]">
            <TypeSafetyDemo />
          </div>
        </div>
      </AnimateIn>
    </div>
  );
}

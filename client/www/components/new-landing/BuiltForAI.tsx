'use client';
import { useState, useEffect } from 'react';
import { AnimateIn } from './AnimateIn';
import Image from 'next/image';

// Animated terminal that types out commands
function AnimatedTerminal() {
  const [step, setStep] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  const steps = [
    { type: 'command', text: 'npx instant-cli login' },
    { type: 'output', text: 'Successfully logged in as joe@instantdb.com!' },
    { type: 'command', text: 'npx create-instant-app awesome-gram' },
    { type: 'output', text: '🎉 Success! Your project is ready to go!' },
    { type: 'command', text: 'npx instant-cli push schema' },
    { type: 'output', text: 'Schema updated!' },
    { type: 'command', text: 'npx vercel --prod' },
    {
      type: 'output',
      text: '✓ App deployed at https://awesome-gram.vercel.app',
    },
  ];

  useEffect(() => {
    if (step >= steps.length) {
      // Reset after a pause
      const timeout = setTimeout(() => {
        setStep(0);
        setIsTyping(true);
      }, 6000);
      return () => clearTimeout(timeout);
    }

    const currentStep = steps[step];
    const delay = currentStep.type === 'command' ? 800 : 600;

    const timeout = setTimeout(() => {
      setStep((s) => s + 1);
    }, delay);

    return () => clearTimeout(timeout);
  }, [step, steps.length]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950 shadow-2xl">
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="flex-1 text-center font-mono text-xs text-gray-500">
          terminal
        </div>
      </div>

      {/* Terminal content */}
      <div className="min-h-[320px] p-4 font-mono text-sm sm:p-6 sm:text-base">
        {steps.slice(0, step).map((s, i) => (
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
            {s.type === 'comment' && (
              <div className="mt-2 text-gray-600">{s.text}</div>
            )}
          </div>
        ))}

        {/* Typing cursor */}
        {step < steps.length && (
          <div className="mt-1 flex items-center gap-2">
            {steps[step].type === 'command' && (
              <span className="text-green-400">$</span>
            )}
            {steps[step].type === 'command' && (
              <span className="text-gray-100">
                <span className="inline-block h-5 w-2 animate-pulse bg-gray-100" />
              </span>
            )}
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

export function BuiltForAI() {
  return (
    <div className="space-y-24">
      {/* Section header */}
      <AnimateIn>
        <div className="sm:text-center">
          <h2 className="text-off-black text-3xl font-semibold sm:text-6xl">
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
            <h3 className="text-2xl font-semibold sm:text-3xl">
              Never leave your terminal
            </h3>
            <p className="mt-4 text-lg text-gray-500">
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
            <h3 className="text-2xl font-semibold sm:text-3xl">
              Easy for humans, perfect for LLMs
            </h3>
            <p className="mt-4 text-lg text-gray-500">
              Instant has a tiny API surface. Modern LLMs already know it from
              their training data. And it takes only 1% of context for advanced
              features.
            </p>
            <p className="mt-4 text-lg text-gray-500">
              Here's how a real-time chat app looks in Instant. Simple to read,
              and even easier for your AI to understand and generate.
            </p>
          </div>
        </div>
      </AnimateIn>

      {/* Feature 3: Type safety */}
      <AnimateIn>
        <div className="flex items-center gap-7">
          <div className="max-w-[440px] text-center">
            <h3 className="text-2xl font-semibold sm:text-3xl">
              End-to-end type safety
            </h3>
            <p className="mt-4 text-lg text-gray-500">
              Instant comes with types for your schema, permissions, queries,
              and transactions. This makes it easy to catch errors early and for
              your AI to understand your data model and generate correct code on
              the first try.
            </p>
          </div>
          <div className="bg-surface/20 grow px-[161px] py-[85px]">
            <div className="rounded-[20px] bg-[#25283A] px-[44px] py-8 shadow">
              <Image
                style={{
                  width: '407',
                  minWidth: '407px',
                  height: '122',
                  minHeight: '122px',
                }}
                width={407}
                height={122}
                src="/img/typesafety.png"
                alt="Type safety visualization"
              />
            </div>
          </div>
        </div>
      </AnimateIn>
    </div>
  );
}

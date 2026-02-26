import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  SectionWide,
  Link,
} from '@/components/marketingUi';
import { ProductNav } from '@/components/productPageUi';
import { Button, Fence, cn } from '@/components/ui';
import {
  queryExamples,
  transactionExamples,
  typeSafetyBlocks,
} from './examples';

function QueryCard() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'query' | 'result' | 'sql'>(
    'query',
  );
  const example = queryExamples[selectedIdx];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {queryExamples.map((ex, i) => (
          <button
            key={ex.label}
            onClick={() => setSelectedIdx(i)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              i === selectedIdx
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {ex.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 overflow-hidden rounded-sm border">
        <div className="flex border-b bg-gray-50">
          {(
            [
              ['query', 'InstaQL'],
              ['result', 'Result'],
              ['sql', 'SQL'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'px-4 py-2 text-xs font-medium transition-colors',
                activeTab === key
                  ? 'border-b-2 border-orange-500 text-gray-900'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="bg-prism overflow-auto text-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${selectedIdx}-${activeTab}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Fence
                darkMode={false}
                language={activeTab === 'sql' ? 'sql' : 'javascript'}
                code={example[activeTab]}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function TransactionCard() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const example = transactionExamples[selectedIdx];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {transactionExamples.map((ex, i) => (
          <button
            key={ex.label}
            onClick={() => setSelectedIdx(i)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              i === selectedIdx
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {ex.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 overflow-hidden rounded-sm border">
        <div className="bg-prism overflow-auto text-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Fence
                darkMode={false}
                language="javascript"
                code={example.code}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function TypeSafetySection() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const block = typeSafetyBlocks[selectedIdx];

  return (
    <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
      <div className="flex flex-col gap-4 md:order-2 md:flex-1">
        <h3 className="font-mono text-2xl font-bold">Full type-safety</h3>
        <p className="text-gray-600">
          Instant provides full type-safety for your schema, queries, and
          transactions. This means you can catch errors at compile time instead
          of runtime. If you change your schema your types will automagically
          update too!
        </p>
        <p className="text-gray-600">
          This also helps with LLMs since they can use the types to better
          understand your data and generate valid queries and transactions for
          you. If they make a mistake they can get immediate feedback from the
          type system.
        </p>
      </div>
      <div className="min-w-0 md:order-1 md:flex-1">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {typeSafetyBlocks.map((b, i) => (
              <button
                key={b.label}
                onClick={() => setSelectedIdx(i)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  i === selectedIdx
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="min-w-0 overflow-hidden rounded-sm border">
            <div className="bg-prism overflow-auto text-sm">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedIdx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Fence
                    darkMode={false}
                    language="typescript"
                    code={block.code}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureSection({
  card,
  details,
  reverse,
}: {
  card: React.ReactNode;
  details: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
      <div
        className={cn('flex flex-col gap-4 md:flex-1', reverse && 'md:order-2')}
      >
        {details}
      </div>
      <div className={cn('min-w-0 md:flex-1', reverse && 'md:order-1')}>
        {card}
      </div>
    </div>
  );
}

function CLIPushCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-[#444] bg-[#1c1c1c]">
      {/* Title bar with traffic lights */}
      <div className="flex items-center gap-2 border-b border-[#333] bg-[#2a2a2a] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
      </div>
      <pre
        className="px-5 pt-4 pb-5 text-sm leading-[1.7] break-all whitespace-pre-wrap"
        style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}
      >
        <span className="text-[#5fd700]">nezaj</span>
        <span className="text-[#d4d4d4]"> at </span>
        <span className="text-[#e5e510]">nezaj</span>
        <span className="text-[#d4d4d4]"> in </span>
        <span className="text-[#00d7ff]">~/my-app</span>
        <span className="text-[#d4d4d4]"> at </span>
        <span className="text-[#5fd700]">main</span>
        {'\n'}
        <span className="text-[#d4d4d4]">$ </span>
        <span className="text-[#d4d4d4]">npx instant-cli push</span>
        {'\n'}
        <span className="text-[#d4d4d4]">Found </span>
        <span className="text-[#5fd700]">NEXT_PUBLIC_INSTANT_APP_ID</span>
        <span className="text-[#d4d4d4]">
          : a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d
        </span>

        {'\n'}
      </pre>
      <div className="mx-5 mb-4 rounded border border-[#444] px-4 py-3">
        <pre
          className="text-sm leading-[1.7] break-all whitespace-pre-wrap"
          style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}
        >
          <span className="bg-[#2ea043] text-[#fff]">
            {' + CREATE NAMESPACE '}
          </span>
          <span className="text-[#d4d4d4]"> todos</span>
          {'\n'}
          <span className="text-[#666]"> + CREATE ATTR </span>
          <span className="text-[#9a9a9a]">todos.id</span>
          {'\n'}
          <span className="text-[#666]"> + CREATE ATTR </span>
          <span className="text-[#9a9a9a]">todos.text</span>
          {'\n'}
          <span className="text-[#666]"> DATA TYPE: </span>
          <span className="text-[#9a9a9a]">string</span>
          {'\n'}
          <span className="text-[#666]"> + CREATE ATTR </span>
          <span className="text-[#9a9a9a]">todos.done</span>
          {'\n'}
          <span className="text-[#666]"> DATA TYPE: </span>
          <span className="text-[#9a9a9a]">boolean</span>
          {'\n'}
          <span className="text-[#666]"> + CREATE ATTR </span>
          <span className="text-[#9a9a9a]">todos.createdAt</span>
          {'\n'}
          <span className="text-[#666]"> DATA TYPE: </span>
          <span className="text-[#9a9a9a]">number</span>
        </pre>
      </div>
      <pre
        className="px-5 pb-5 text-sm leading-[1.7] break-all whitespace-pre-wrap"
        style={{ fontFamily: 'Menlo, Monaco, "Courier New", monospace' }}
      >
        {'\n'}
        <span className="text-[#d4d4d4]">Push these changes?</span>
        {'\n'}
        <span className="bg-[#c87b2e] text-[#fff]">{'  Push  '}</span>
        <span>{'    '}</span>
        <span className="bg-[#555] text-[#ccc]">{'  Cancel  '}</span>
      </pre>
    </div>
  );
}

function CLIDetails() {
  return (
    <>
      <h3 className="font-mono text-2xl font-bold">
        CLI tools for agentic development
      </h3>
      <p className="text-gray-600">
        Our CLI tools make it easy to manage your Instant project and scaffold
        new ones. Anything you can do in the dashboard your agent can do from
        the terminal.{' '}
      </p>
    </>
  );
}

export default function Database() {
  return (
    <LandingContainer>
      <Head>
        <title>Database - Instant</title>
        <meta
          name="description"
          content="Instant has everything you need to build web and mobile apps with your favorite LLM."
        />
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <div>
          <MainNav />
          <ProductNav currentSlug="database" />

          {/* Hero */}
          <div className="py-20">
            <SectionWide>
              <div className="flex flex-col gap-10">
                <div className="flex flex-col items-center gap-8 text-center">
                  <p className="font-mono text-sm font-medium tracking-widest text-orange-600 uppercase">
                    Instant Database
                  </p>
                  <h2 className="font-mono text-3xl leading-snug font-bold tracking-wide md:text-5xl md:leading-tight">
                    The best database for <br className="hidden md:block" />
                    <span className="text-orange-600">AI-coded apps.</span>
                  </h2>
                  <p className="max-w-lg text-lg text-gray-600">
                    Instant has everything you need to build web and mobile apps
                    with your favorite LLM.
                  </p>
                  <div className="flex gap-3">
                    <Button type="link" variant="cta" size="large" href="/dash">
                      Get started
                    </Button>
                    <Button
                      type="link"
                      variant="secondary"
                      size="large"
                      href="/docs"
                    >
                      Read the docs
                    </Button>
                  </div>
                </div>
              </div>
            </SectionWide>
          </div>

          {/* Features */}
          <div className="my-16">
            <SectionWide>
              <div className="flex flex-col gap-24">
                {/* Easy to query */}
                <FeatureSection
                  card={<QueryCard />}
                  details={
                    <>
                      <h3 className="font-mono text-2xl font-bold">
                        Easy to query
                      </h3>
                      <p className="text-gray-600">
                        Instant's query language, InstaQL, is designed to be
                        easy to understand. It uses plain JavaScript objects to
                        declare the data you want to fetch and the shape you
                        want.
                      </p>
                      <p className="text-gray-600">
                        If you ever need to change what to fetch you can just
                        change the query object and your UI will update on its
                        own. No need for a build step or to update any backend
                        code.
                      </p>
                      <p className="text-gray-600">
                        InstaQL supports filtering, sorting, pagination and
                        more. The syntax is simple enough to learn in minutes
                        and LLMs can easily generate queries for you too!
                      </p>
                    </>
                  }
                />

                {/* Easy to transact */}
                <FeatureSection
                  reverse
                  card={<TransactionCard />}
                  details={
                    <>
                      <h3 className="font-mono text-2xl font-bold">
                        Easy to transact
                      </h3>
                      <p className="text-gray-600">
                        Modifying data in Instant is easy with our transaction
                        language InstaML.
                      </p>
                      <p className="text-gray-600">
                        Making changes is as simple as calling{' '}
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          create
                        </code>
                        ,{' '}
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          update
                        </code>
                        , or{' '}
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          delete
                        </code>
                        . You can also use{' '}
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          link
                        </code>{' '}
                        and{' '}
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          unlink
                        </code>{' '}
                        to manage relationships between entities.
                      </p>
                      <p className="text-gray-600">
                        Transactions are atomically committed with{' '}
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                          db.transact
                        </code>{' '}
                        and you're guaranteed to end up with consistent data.
                      </p>
                    </>
                  }
                />

                {/* No need for a server */}
                <div className="flex flex-col gap-8 md:flex-row md:items-center md:gap-12">
                  <div className="flex flex-col gap-4 md:flex-1">
                    <h3 className="font-mono text-2xl font-bold">
                      No need for a server
                    </h3>
                    <p className="text-gray-600">
                      Use our client SDKs to use InstantDB directly from your
                      frontend. No need to manage a database or server.
                    </p>
                    <p className="text-gray-600">
                      You can just focus on building an amazing app and we'll
                      handle the rest.
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-sm border md:flex-1">
                    <img
                      src="/img/product-pages/database/instant-arch.webp"
                      alt="Instant architecture diagram"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Full type-safety */}
                <TypeSafetySection />

                {/* CLI Tools */}
                <FeatureSection
                  card={<CLIPushCard />}
                  details={
                    <div className="flex flex-col gap-4">
                      <CLIDetails />
                    </div>
                  }
                />
              </div>
            </SectionWide>
          </div>

          {/* Generous free tier */}
          <div className="mt-24 mb-20">
            <SectionWide>
              <div className="text-center">
                <h3 className="font-mono text-2xl font-bold tracking-wide md:text-4xl">
                  The most generous <br className="hidden md:block" />
                  <span className="text-orange-600">
                    free tier in databases.
                  </span>
                </h3>
                <div className="mx-auto mt-10 flex max-w-4xl flex-col gap-6 md:flex-row">
                  <div className="flex-1 rounded-sm border p-6 text-left">
                    <p className="text-3xl font-bold">Unlimited</p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      Free projects
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                      Create as many apps as you want. We never pause inactive
                      projects.
                    </p>
                  </div>
                  <div className="flex-1 rounded-sm border p-6 text-left">
                    <p className="text-3xl font-bold">Free</p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      To get started
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                      No credit card. No trial period. No restrictions for
                      commercial use.
                    </p>
                  </div>
                  <div className="flex-1 rounded-sm border p-6 text-left">
                    <p className="text-3xl font-bold">Scales</p>
                    <p className="mt-1 font-mono text-sm font-medium">
                      When you need it
                    </p>
                    <p className="mt-2 text-sm text-gray-600">
                      When you're ready to grow, we have plans that scale with
                      your usage.
                    </p>
                  </div>
                </div>
                <div className="mt-10 flex justify-center gap-3">
                  <Button type="link" variant="cta" href="/dash">
                    Start building
                  </Button>
                  <Button type="link" variant="secondary" href="/pricing">
                    View pricing
                  </Button>
                </div>
                <p className="mt-6 text-sm text-gray-500">
                  Instant is{' '}
                  <Link
                    href="https://github.com/instantdb/instant"
                    className="underline hover:text-gray-700"
                  >
                    100% Open Source
                  </Link>
                </p>
              </div>
            </SectionWide>
          </div>
        </div>
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}

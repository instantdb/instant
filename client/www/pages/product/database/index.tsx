import { useState, type ReactNode } from 'react';
import Highlight, { defaultProps } from 'prism-react-renderer';
import Head from 'next/head';
import * as og from '@/lib/og';
import { MainNav, ProductNav, Link } from '@/components/marketingUi';
import { cn } from '@/components/ui';
import {
  queryExamples,
  transactionExamples,
  typicalArch,
  instantArch,
} from '@/lib/product/database/examples';
import {
  AnimatedTerminal,
  TypeSafetyDemo,
} from '@/components/new-landing/BuiltForAI';
import { Section } from '@/components/new-landing/Section';
import {
  LandingButton,
  SectionTitle,
  SectionSubtitle,
  Subheading,
} from '@/components/new-landing/typography';
import { Footer } from '@/components/new-landing/Footer';
import { TopWash } from '@/components/new-landing/TopWash';
import { AnimateIn } from '@/components/new-landing/AnimateIn';

function DiagramPre({
  diagram,
  highlights = [],
  className,
}: {
  diagram: string;
  highlights?: string[];
  className?: string;
}) {
  const parts =
    highlights.length === 0
      ? [diagram]
      : diagram.split(
          new RegExp(
            `(${highlights.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
            'g',
          ),
        );

  return (
    <div className={cn('overflow-x-auto rounded-lg border p-5', className)}>
      <pre className="mx-auto w-fit font-mono text-xs leading-relaxed text-gray-600">
        {parts.map((part, i) =>
          highlights.includes(part) ? (
            <span key={i} className="text-orange-500">
              {part}
            </span>
          ) : (
            part
          ),
        )}
      </pre>
    </div>
  );
}

function ArchDiagram() {
  return (
    <div className="flex flex-col gap-3">
      <DiagramPre diagram={typicalArch} className="bg-gray-50" />
      <DiagramPre
        diagram={instantArch}
        highlights={['With Instant', '{ todos: {} }', 'realtime data']}
        className="bg-gray-50"
      />
    </div>
  );
}

function PillTray({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-gray-200/60 p-1.5">
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

const editorTheme = {
  plain: {
    backgroundColor: '#faf8f5',
    color: '#575279',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'cdata', 'punctuation'],
      style: { color: '#797593' },
    },
    {
      types: ['delimiter', 'important', 'atrule', 'operator', 'keyword'],
      style: { color: '#286983' },
    },
    {
      types: [
        'tag',
        'doctype',
        'variable',
        'regex',
        'class-name',
        'selector',
        'inserted',
      ],
      style: { color: '#56949f' },
    },
    {
      types: ['boolean', 'entity', 'number', 'symbol', 'function'],
      style: { color: '#d7827e' },
    },
    {
      types: ['string', 'char', 'property', 'attr-value'],
      style: { color: '#ea9d34' },
    },
    {
      types: ['parameter', 'url', 'attr-name', 'builtin'],
      style: { color: '#907aa9' },
    },
    { types: ['deleted'], style: { color: '#b4637a' } },
  ],
};

function CodeEditor({ code, language }: { code: string; language: string }) {
  return (
    <Highlight
      {...defaultProps}
      code={code.trimEnd()}
      language={language as any}
      theme={editorTheme}
    >
      {({ tokens, getTokenProps }) => (
        <pre
          className="m-0 p-4 font-mono text-sm leading-relaxed"
          style={{ backgroundColor: '#faf8f5' }}
        >
          <code>
            {tokens.map((line, lineIndex) => (
              <span key={lineIndex} className="flex">
                <span className="inline-block w-8 shrink-0 text-right text-gray-400/60 select-none">
                  {lineIndex + 1}
                </span>
                <span className="ml-4 flex-1">
                  {line
                    .filter((token) => !token.empty)
                    .map((token, tokenIndex) => {
                      const { key, ...props } = getTokenProps({ token });
                      return <span key={key || tokenIndex} {...props} />;
                    })}
                </span>
              </span>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}

function TabbedCodeExample({
  examples,
  tabs,
  height = 'h-72',
}: {
  examples: { label: string; [key: string]: string }[];
  tabs: { key: string; label: string; language?: string }[];
  height?: string;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeTabKey, setActiveTabKey] = useState(tabs[0].key);
  const example = examples[selectedIdx];
  const activeTab = tabs.find((t) => t.key === activeTabKey) || tabs[0];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PillTray>
        {examples.map((ex, i) => (
          <button
            key={ex.label}
            onClick={() => setSelectedIdx(i)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              i === selectedIdx
                ? 'border-orange-600 bg-orange-600 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            {ex.label}
          </button>
        ))}
      </PillTray>
      <div
        className="min-w-0 overflow-hidden rounded-lg border border-gray-200"
        style={{ backgroundColor: '#faf8f5' }}
      >
        <div className="flex border-b border-gray-200/60">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTabKey(tab.key)}
              className={cn(
                'border-r border-r-gray-200/60 px-4 py-2 text-sm font-medium transition-colors',
                activeTabKey === tab.key
                  ? 'text-gray-900 shadow-[inset_0_-2px_0_0_#f97316]'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={cn(height, 'overflow-auto text-sm')}>
          <CodeEditor
            language={activeTab.language || 'javascript'}
            code={example[activeTab.key]}
          />
        </div>
      </div>
    </div>
  );
}

export default function Database() {
  const title = 'Database - Instant';
  const description =
    'Instant has everything you need to build web and mobile apps with your favorite LLM.';

  return (
    <div className="text-off-black w-full overflow-x-auto">
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta key="og:title" property="og:title" content={title} />
        <meta
          key="og:description"
          property="og:description"
          content={description}
        />
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ title: 'Database', section: 'Product' })}
        />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <MainNav transparent />

      {/* Hero */}
      <div className="relative pt-16">
        <TopWash />
        <ProductNav currentSlug="database" />
        <Section className="relative pt-12 pb-6 sm:pt-16 sm:pb-10">
          <div className="flex flex-col items-center text-center">
            <SectionTitle>
              The best database for <br className="hidden md:block" />
              <span className="text-orange-600">AI-coded apps.</span>
            </SectionTitle>
            <SectionSubtitle>{description}</SectionSubtitle>
            <div className="mt-8 flex gap-3">
              <LandingButton href="/dash">Get started</LandingButton>
              <LandingButton href="/docs" variant="secondary">
                Read the docs
              </LandingButton>
            </div>
          </div>
        </Section>
      </div>

      {/* Features */}
      <Section className="pb-0 sm:pb-0">
        <div className="space-y-24">
          {/* Easy to query */}
          <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
              <div className="space-y-4 md:max-w-[400px]">
                <Subheading>Easy to query</Subheading>
                <p className="mt-2 text-base">
                  Instant's query language, InstaQL, is designed to be easy to
                  understand. It uses plain JavaScript objects to declare the
                  data you want to fetch and the shape you want.
                </p>
                <p className="mt-2 text-base">
                  If you ever need to change what to fetch you can just change
                  the query object and your UI will update on its own. No need
                  for a build step or to update any backend code.
                </p>
                <p className="mt-2 text-base">
                  InstaQL supports filtering, sorting, pagination and more. The
                  syntax is simple enough to learn in minutes and LLMs can
                  easily generate queries for you too!
                </p>
              </div>
              <div className="min-w-0 grow lg:bg-[#F0F5FA] lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={queryExamples}
                  tabs={[
                    { key: 'query', label: 'InstaQL' },
                    { key: 'result', label: 'Result' },
                    { key: 'sql', label: 'Equivalent SQL', language: 'sql' },
                  ]}
                />
              </div>
            </div>

          {/* Easy to transact */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center">
              <div className="lg:bg-surface/20 min-w-0 grow lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={transactionExamples}
                  tabs={[{ key: 'code', label: 'InstaML' }]}
                  height="h-56"
                />
              </div>
              <div className="space-y-4 md:max-w-[440px]">
                <Subheading>Easy to transact</Subheading>
                <p className="mt-2 text-base">
                  Modifying data in Instant is easy with our transaction
                  language InstaML.
                </p>
                <p className="mt-2 text-base">
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
                <p className="mt-2 text-base">
                  Transactions are atomically committed with{' '}
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                    db.transact
                  </code>{' '}
                  and you're guaranteed to end up with consistent data.
                </p>
              </div>
            </div>
          </AnimateIn>

          {/* No need for a server */}
          <AnimateIn>
            <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
              <div className="space-y-4 md:max-w-[400px]">
                <Subheading>No need for a server</Subheading>
                <p className="mt-2 text-base">
                  Use our client SDKs to use InstantDB directly from your
                  frontend. No need to manage a database or server.
                </p>
                <p className="mt-2 text-base">
                  You can just focus on building an amazing app and we'll handle
                  the rest.
                </p>
              </div>
              <div className="grow lg:bg-radial lg:from-white lg:to-[#FFF9F4] lg:px-[66px] lg:py-[37px]">
                <ArchDiagram />
              </div>
            </div>
          </AnimateIn>

          {/* Full type-safety */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center">
              <div className="lg:bg-surface/20 grow lg:px-[66px] lg:py-[37px]">
                <TypeSafetyDemo />
              </div>
              <div className="space-y-4 md:max-w-[440px]">
                <Subheading>Full type-safety</Subheading>
                <p className="mt-2 text-base">
                  Instant provides full type-safety for your schema, queries,
                  and transactions. This means you can catch errors at compile
                  time instead of runtime. If you change your schema your types
                  will automagically update too!
                </p>
                <p className="mt-2 text-base">
                  This also helps with LLMs since they can use the types to
                  better understand your data and generate valid queries and
                  transactions for you. If they make a mistake they can get
                  immediate feedback from the type system.
                </p>
              </div>
            </div>
          </AnimateIn>

          {/* CLI Tools */}
          <AnimateIn>
            <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
              <div className="space-y-4 md:max-w-[400px]">
                <Subheading>CLI tools for agentic development</Subheading>
                <p className="mt-2 text-base">
                  Our CLI tools make it easy to manage your Instant project and
                  scaffold new ones. Anything you can do in the dashboard your
                  agent can do from the terminal.
                </p>
              </div>
              <div className="grow lg:bg-[#F0F5FA] lg:px-[66px] lg:py-[37px]">
                <div className="mx-auto max-w-[420px]">
                  <AnimatedTerminal />
                </div>
              </div>
            </div>
          </AnimateIn>
        </div>
      </Section>

      {/* Generous free tier */}
      <div className="relative overflow-hidden bg-[#F0F5FA]">
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-48 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        <Section className="relative z-10">
          <AnimateIn>
            <div className="text-center">
              <SectionTitle>
                The most generous <br className="hidden md:block" />
                <span className="text-orange-600">free tier in databases.</span>
              </SectionTitle>
              <div className="mx-auto mt-10 flex max-w-4xl flex-col gap-6 md:flex-row">
                <div className="flex-1 rounded-xl border bg-white p-6 text-left">
                  <p className="text-3xl">Unlimited</p>
                  <p className="mt-1 text-base font-medium">Free projects</p>
                  <p className="mt-2 text-base text-gray-600">
                    Create as many apps as you want. We never pause inactive
                    projects.
                  </p>
                </div>
                <div className="flex-1 rounded-xl border bg-white p-6 text-left">
                  <p className="text-3xl">Free</p>
                  <p className="mt-1 text-base font-medium">To get started</p>
                  <p className="mt-2 text-base text-gray-600">
                    No credit card. No trial period. No restrictions for
                    commercial use.
                  </p>
                </div>
                <div className="flex-1 rounded-xl border bg-white p-6 text-left">
                  <p className="text-3xl">Scales</p>
                  <p className="mt-1 text-base font-medium">When you need it</p>
                  <p className="mt-2 text-base text-gray-600">
                    When you're ready to grow, we have plans that scale with
                    your usage.
                  </p>
                </div>
              </div>
              <div className="mt-10 flex justify-center gap-3">
                <LandingButton href="/dash">Start building</LandingButton>
                <LandingButton href="/pricing" variant="secondary">
                  View pricing
                </LandingButton>
              </div>
              <p className="mt-6 text-base text-gray-500">
                Instant is{' '}
                <Link
                  href="https://github.com/instantdb/instant"
                  className="underline hover:text-gray-700"
                >
                  100% Open Source
                </Link>
              </p>
            </div>
          </AnimateIn>
        </Section>
      </div>

      <Footer />
    </div>
  );
}

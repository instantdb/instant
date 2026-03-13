import { useState, type ReactNode } from 'react';
import Highlight, { defaultProps } from 'prism-react-renderer';
import Head from 'next/head';
import * as og from '@/lib/og';
import { MainNav, ProductNav, Link } from '@/components/marketingUi';
import { cn } from '@/components/ui';
import { adminExamples, httpExamples } from '@/lib/product/admin-sdk/examples';
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

export default function AdminSdk() {
  const title = 'Admin SDK - Instant';
  const description =
    'Use Instant on your backend with elevated permissions. Same APIs, server-side power.';

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
          content={og.url({ title: 'Admin SDK', section: 'Product' })}
        />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <MainNav transparent />

      {/* Hero */}
      <div className="relative pt-16">
        <TopWash />
        <ProductNav currentSlug="admin-sdk" />
        <Section className="relative pt-12 pb-6 sm:pt-16 sm:pb-10">
          <div className="flex flex-col items-center text-center">
            <SectionTitle>
              Reactivity <br />
              <span className="text-orange-600">on the backend.</span>
            </SectionTitle>
            <SectionSubtitle>
              Integrate payments, crons, and third-party APIs in a secure
              environment.
            </SectionSubtitle>
            <div className="mt-8 flex gap-3">
              <LandingButton href="/dash">Get started</LandingButton>
              <LandingButton href="/docs/backend" variant="secondary">
                Read the docs
              </LandingButton>
            </div>
          </div>
        </Section>
      </div>

      {/* Features */}
      <Section className="pb-0 sm:pb-0">
        <div className="space-y-24">
          {/* Use Instant on the backend */}
          <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
            <div className="space-y-4 md:max-w-[400px]">
              <Subheading>Use Instant on the backend</Subheading>
              <p className="mt-2 text-base text-gray-600">
                When you need to interact with your database from a secure
                environment you can use the Instant Admin SDK.
              </p>
              <p className="mt-2 text-base text-gray-600">
                It has the same API as the client SDK but with elevated
                permissions. This makes it perfect for running background jobs,
                integrating third-party APIs{' '}
                <Link
                  href="/docs/stripe-payments"
                  className="underline hover:text-gray-800"
                >
                  like Stripe
                </Link>
                , and executing any transactions that you don't want exposed to
                the client.
              </p>
            </div>
            <div className="min-w-0 grow lg:bg-[#F0F5FA] lg:px-[66px] lg:py-[37px]">
              <TabbedCodeExample
                examples={adminExamples}
                tabs={[{ key: 'code', label: 'Admin SDK' }]}
              />
            </div>
          </div>

          {/* HTTP API for non-JS backends */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center">
              <div className="lg:bg-surface/20 min-w-0 grow lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={httpExamples}
                  tabs={[{ key: 'code', label: 'HTTP', language: 'bash' }]}
                />
              </div>
              <div className="space-y-4 md:max-w-[440px]">
                <Subheading>HTTP API for non-JS backends</Subheading>
                <p className="mt-2 text-base text-gray-600">
                  The Admin SDK is built on top of our HTTP API. If you're using
                  a non-JS backend you can use Instant by hitting the API
                  directly.
                </p>
                <p className="mt-2 text-base text-gray-600">
                  Everything you can do with the Admin SDK you can do with the
                  HTTP API!
                </p>
              </div>
            </div>
          </AnimateIn>
        </div>
      </Section>

      {/* CTA */}
      <div className="relative overflow-hidden bg-[#F0F5FA]">
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-48 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        <Section className="relative z-10">
          <AnimateIn>
            <div className="text-center">
              <SectionTitle>
                <span className="text-orange-600">Build full-stack apps</span>
                <br className="hidden md:block" /> with Instant.
              </SectionTitle>
              <SectionSubtitle>
                Instant has you covered on both the frontend and the backend.
              </SectionSubtitle>
              <div className="mt-10 flex justify-center gap-3">
                <LandingButton href="/dash">Get started</LandingButton>
                <LandingButton href="/docs/backend" variant="secondary">
                  Read the docs
                </LandingButton>
              </div>
            </div>
          </AnimateIn>
        </Section>
      </div>

      <Footer />
    </div>
  );
}

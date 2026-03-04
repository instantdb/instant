import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  Link,
  MainNav,
  ProductNav,
  SectionWide,
} from '@/components/marketingUi';
import { Button, Fence, type FenceLanguage, cn } from '@/components/ui';
import { adminExamples, httpExamples } from '@/lib/product/admin-sdk/examples';

function ExampleCard({
  examples,
  language,
}: {
  examples: { label: string; code: string }[];
  language: FenceLanguage;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const example = examples[selectedIdx];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {examples.map((ex, i) => (
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
              <Fence darkMode={false} language={language} code={example.code} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function AdminSdk() {
  return (
    <LandingContainer>
      <Head>
        <title>Admin SDK - Instant</title>
        <meta
          name="description"
          content="Use Instant on your backend with elevated permissions. Same APIs, server-side power."
        />
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <div>
          <MainNav />
          <ProductNav currentSlug="admin-sdk" />

          {/* Hero */}
          <div className="py-20">
            <SectionWide>
              <div className="flex flex-col gap-10">
                <div className="flex flex-col items-center gap-8 text-center">
                  <p className="font-mono text-sm font-medium tracking-widest text-orange-600 uppercase">
                    Instant Admin SDK
                  </p>
                  <h2 className="font-mono text-3xl leading-snug font-bold tracking-wide md:text-5xl md:leading-tight">
                    Reactivity
                    <br />
                    <span className="text-orange-600">on the backend.</span>
                  </h2>
                  <p className="max-w-lg text-lg text-gray-600">
                    Integrate payments, crons, and third-party APIs in a secure
                    environment.
                  </p>
                  <div className="flex gap-3">
                    <Button type="link" variant="cta" size="large" href="/dash">
                      Get started
                    </Button>
                    <Button
                      type="link"
                      variant="secondary"
                      size="large"
                      href="/docs/backend"
                    >
                      Read the docs
                    </Button>
                  </div>
                </div>
              </div>
            </SectionWide>
          </div>

          {/* Use Instant on the backend */}
          <div className="my-16">
            <SectionWide>
              <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
                <div className="flex flex-col gap-4 md:flex-1">
                  <h3 className="font-mono text-2xl font-bold">
                    Use Instant on the backend
                  </h3>
                  <p className="text-gray-600">
                    When you need to interact with your database from a secure
                    environment you can use the Instant Admin SDK.
                  </p>
                  <p className="text-gray-600">
                    It has the same API as the client SDK but with elevated
                    permissions. This makes it perfect for running background
                    jobs, integrating third-party APIs{' '}
                    <Link
                      href="/docs/stripe-payments"
                      className="underline hover:text-gray-800"
                    >
                      like Stripe
                    </Link>
                    , and executing any transactions that you don't want exposed
                    to the client.
                  </p>
                </div>
                <div className="min-w-0 md:flex-1">
                  <ExampleCard examples={adminExamples} language="javascript" />
                </div>
              </div>
            </SectionWide>
          </div>

          {/* HTTP API for non-JS backends */}
          <div className="my-16">
            <SectionWide>
              <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
                <div className="flex flex-col gap-4 md:order-2 md:flex-1">
                  <h3 className="font-mono text-2xl font-bold">
                    HTTP API for non-JS backends
                  </h3>
                  <p className="text-gray-600">
                    The Admin SDK is built on top of our HTTP API. If you're
                    using a non-JS backend you can use Instant by hitting the
                    API directly.
                  </p>
                  <p className="text-gray-600">
                    Everything you can do with the Admin SDK you can do with the
                    HTTP API!
                  </p>
                </div>
                <div className="min-w-0 md:order-1 md:flex-1">
                  <ExampleCard examples={httpExamples} language="bash" />
                </div>
              </div>
            </SectionWide>
          </div>

          {/* CTA */}
          <div className="mt-24 mb-20">
            <SectionWide>
              <div className="text-center">
                <h3 className="font-mono text-2xl font-bold tracking-wide md:text-4xl">
                  <span className="text-orange-600">Build full-stack apps</span>
                  <br className="hidden md:block" /> with Instant.
                </h3>
                <p className="mx-auto mt-4 max-w-lg text-gray-600">
                  Instant has you covered on both the frontend and the backend.
                </p>
                <div className="mt-10 flex justify-center gap-3">
                  <Button type="link" variant="cta" href="/dash">
                    Get started
                  </Button>
                  <Button type="link" variant="secondary" href="/docs/backend">
                    Read the docs
                  </Button>
                </div>
              </div>
            </SectionWide>
          </div>
        </div>
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}

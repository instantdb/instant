import Head from 'next/head';
import * as og from '@/lib/og';
import { MainNav, ProductNav, Link } from '@/components/marketingUi';
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
import { TabbedCodeExample } from '@/components/new-landing/TabbedCodeExample';

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

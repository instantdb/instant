import { ComponentType, useState } from 'react';
import Head from 'next/head';
import * as og from '@/lib/og';
import Image from 'next/image';
import { MainNav, ProductNav } from '@/components/marketingUi';
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
import { RealtimeSyncWalkthrough } from '@/components/product/sync/RealtimeSyncWalkthrough';
import { OptimisticUpdateDiagram } from '@/components/product/sync/OptimisticUpdateDiagram';
import { ConflictResolutionWalkthrough } from '@/components/product/sync/ConflictResolutionWalkthrough';
import { OfflinePersistenceWalkthrough } from '@/components/product/sync/OfflinePersistenceWalkthrough';

import figmaIcon from '@/public/img/product-pages/sync/figma.svg';
import notionIcon from '@/public/img/product-pages/sync/notion.svg';
import linearIcon from '@/public/img/product-pages/sync/linear.svg';

const syncCompanies = [
  { name: 'Figma', icon: figmaIcon },
  { name: 'Notion', icon: notionIcon },
  { name: 'Linear', icon: linearIcon },
];

const features = [
  {
    title: 'Every interaction is instant',
    description:
      'There is no loading spinner, lag, or waiting. When you click a button, the app responds immediately.',
  },
  {
    title: 'Collaboration is enabled by default',
    description:
      "No need to pull to refresh. You can work together in real-time and see each other's changes instantly.",
  },
  {
    title: "Apps keep working even when you're offline",
    description:
      "You can keep using the app and your changes will sync when you come back online. Imagine using your favorite note-taking app and it doesn't load when your connection is spotty. That's not delightful.",
  },
];

const layers: {
  title: string;
  why: string;
  description: string;
  Walkthrough: ComponentType;
}[] = [
  {
    title: 'Optimistic Update Layer',
    why: 'Users want instant feedback. Without optimistic updates, every action waits for a server round trip.',
    description:
      "When a user makes a change we first apply it to a local store so users see the update immediately. We'll also need to track this as a pending mutation. That way we can rollback if the server rejects the mutation. If the server accepts, we clear the mutation from the pending queue.",
    Walkthrough: OptimisticUpdateDiagram,
  },
  {
    title: 'Real-time Sync',
    why: "Users working together want to see each other's changes in real-time, not after a page refresh.",
    description:
      'We need to do polling or websockets. Websockets will be more-real time but then we need to handle disconnects and reconnects. When changes come in we need to merge remote updates into our local store.',
    Walkthrough: RealtimeSyncWalkthrough,
  },
  {
    title: 'Offline Persistence',
    why: "Users want to be able to use their apps even when offline. Spotty connections shouldn't mean lost work either.",
    description:
      "We need to persist queries and mutations to IndexedDB in case the user goes offline. When the user comes back, we replay their queued transactions in order. Any transactions that have already been acknowledged are removed so the store doesn't grow forever.",
    Walkthrough: OfflinePersistenceWalkthrough,
  },
  {
    title: 'Conflict Resolution',
    why: 'When you allow collaboration, you need to handle what happens when two people edit the same thing at once.',
    description:
      'Alyssa and Louis both edit the same shape at the same time. Who wins? We need a strategy to decide (for example last write wins). We also need to rollback clients who have inconsistent optimistic state.',
    Walkthrough: ConflictResolutionWalkthrough,
  },
];

const hardClosing = [
  'This is a lot of code!',
  "Doing it by hand will probably take too long. Even if AI writes it, you'll need to maintain it for every feature you build.",
];

function HardSection() {
  const [active, setActive] = useState(0);
  const layer = layers[active];
  return (
    <div>
      <Subheading>Building these features is hard</Subheading>
      <p className="mt-4 max-w-2xl text-base text-gray-600">
        Want to add these features to your app on your own? Here's what you'll
        need to build.
      </p>
      <div className="mt-10 flex flex-col gap-6 md:flex-row md:gap-12">
        <div className="md:w-64 md:shrink-0">
          <div className="flex flex-col gap-1">
            {layers.map((l, i) => (
              <button
                key={l.title}
                onClick={() => setActive(i)}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                  active === i
                    ? 'bg-orange-50 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span
                  className={`text-sm font-bold ${active === i ? 'text-orange-600' : 'text-gray-400'}`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-sm font-medium">{l.title}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 hidden space-y-3 text-sm text-gray-600 md:block">
            {hardClosing.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900">{layer.why}</p>
          <p className="mt-2 text-base text-gray-600">{layer.description}</p>
          <layer.Walkthrough />
        </div>
      </div>
      <div className="mt-10 max-w-2xl space-y-3 text-gray-600 md:hidden">
        {hardClosing.map((text, i) => (
          <p key={i}>{text}</p>
        ))}
      </div>
    </div>
  );
}

export default function SyncEngine() {
  const title = 'Sync Engine - Instant';
  const description =
    'Make every feature feel instant, be collaborative, and work offline. No extra code required.';

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
          content={og.url({ title: 'Sync Engine', section: 'Product' })}
        />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <MainNav transparent />

      {/* Hero */}
      <div className="relative pt-16">
        <TopWash />
        <ProductNav currentSlug="sync" />
        <Section className="relative pt-12 pb-6 sm:pt-16 sm:pb-10">
          <div className="flex flex-col items-center text-center">
            <SectionTitle>
              <span className="text-orange-600">Delightful applications</span>
              <br /> by default.
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

      {/* Delightful apps share common features */}
      <Section className="pb-0 sm:pb-0">
        <div className="space-y-24">
          <div className="flex flex-col gap-10 md:flex-row md:gap-20">
            <div className="md:flex-1">
              <Subheading>Delightful apps share common features</Subheading>
              <p className="mt-4 text-base text-gray-600">
                It's easier than ever to build apps these days, especially when
                you're using AI. However, making something delightful is still
                hard. When you look at some of the best apps today, they all
                have certain features in common.
              </p>
              <div className="mt-6 flex items-center gap-5">
                {syncCompanies.map((company) => (
                  <div key={company.name} className="flex items-center gap-2">
                    <Image
                      alt={`${company.name} logo`}
                      src={company.icon}
                      width={28}
                      height={28}
                      className="opacity-50"
                    />
                    <span className="text-sm text-gray-400">
                      {company.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-8 md:flex-1">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-4">
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
                  <div>
                    <p className="font-medium">{f.title}</p>
                    <p className="mt-2 text-base text-gray-600">
                      {f.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Building these features is hard */}
          <AnimateIn>
            <HardSection />
          </AnimateIn>
        </div>
      </Section>

      {/* Mini CTA: With Instant you get sync for free */}
      <div className="relative overflow-hidden bg-[#F0F5FA]">
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-48 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        <Section className="relative z-10">
          <AnimateIn>
            <div className="text-center">
              <SectionTitle>
                With Instant you get <br className="hidden md:block" />
                <span className="text-orange-600">sync for free.</span>
              </SectionTitle>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
                In the past companies would hire a team of elite engineers to
                build a custom sync engine. In the future all apps will have
                sync by default.
              </p>
              <div className="mt-10 flex justify-center gap-3">
                <LandingButton href="/dash">Get started</LandingButton>
                <LandingButton href="/docs" variant="secondary">
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

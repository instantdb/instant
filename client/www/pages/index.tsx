import Head from 'next/head';
import { Link, MainNav } from '@/components/marketingUi';

import { ChevronRightIcon } from '@heroicons/react/24/solid';
import { Hero } from '@/components/new-landing/Hero';
import { Section } from '@/components/new-landing/Section';
import { BuiltForAI } from '@/components/new-landing/BuiltForAI';
import { BatteriesForAI } from '@/components/new-landing/BatteriesForAI';
import { SyncEngine } from '@/components/new-landing/SyncEngine';
import { SyncRelations } from '@/components/new-landing/SyncRelations';
import { SocialProof } from '@/components/new-landing/SocialProof';
import { WallOfLove } from '@/components/new-landing/WallOfLove';
import { FinalCTA } from '@/components/new-landing/FinalCTA';
import { Footer } from '@/components/new-landing/Footer';
import { AgentPathsBg } from '@/components/home/AgentPathsBg';

// ---------------------------------------------------------
// Hero background — swap this import to change the effect:
//   import { AgentPathsBg } from '@/components/home/AgentPathsBg';
//   import { ConstellationBg } from '@/components/home/ConstellationBg';
//   import { RipplesBg } from '@/components/home/RipplesBg';
// Then replace <AgentPathsBg /> below with the chosen component.
// ---------------------------------------------------------
const HeroBg = AgentPathsBg;

const SeeTheCodeButton = ({ href }: { href: string }) => (
  <Link
    href={href}
    className="flex items-center gap-1 rounded-full border bg-white px-2.5 py-0.5 text-sm shadow-sm backdrop-blur-lg hover:bg-gray-50"
  >
    See the code <ChevronRightIcon height="1rem" />
  </Link>
);

export default function Landing2026() {
  return (
    <div className="text-off-black relative">
      <MainNav transparent />
      <Head>
        <title>Instant</title>
        <meta
          key="og:title"
          property="og:title"
          content="InstantDB: A Modern Firebase"
        />
        <meta
          key="og:description"
          property="og:description"
          content="We make you productive by giving your frontend a real-time database."
        />
      </Head>
      <main className="flex-1">
        {/* Hero — animated background, fades to white at bottom */}
        <section className="relative overflow-hidden bg-[#F8F8F8]">
          <HeroBg />
          <div className="relative z-10 pt-10 pb-8 sm:pt-16 sm:pb-12">
            <Hero />
          </div>
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        </section>

        {/* Rest of page — clean */}
        <Section className="" id="built-for-ai">
          <BuiltForAI />
        </Section>

        <Section id="batteries-for-ai">
          <BatteriesForAI />
        </Section>

        <div className="bg-linear-to-b from-[#F7F7F7] to-white">
          <Section className="" id="sync-engine">
            <SyncEngine />
          </Section>
        </div>

        <Section id="sync-relations">
          <SyncRelations />
        </Section>

        <div
          className="relative overflow-hidden bg-[#F8F8F8]"
          id="social-proof"
        >
          <div className="opacity-40">
            <HeroBg />
          </div>
          <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-32 bg-gradient-to-b from-white to-transparent" />
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-32 bg-gradient-to-b from-transparent to-white" />
          <div className="relative z-10 py-16 sm:py-24">
            <div className="landing-width mx-auto">
              <SocialProof />
            </div>
          </div>
        </div>

        <Section id="wall-of-love">
          <WallOfLove />
        </Section>

        <Section className="pt-0!">
          <FinalCTA />
        </Section>
      </main>
      <Footer />
    </div>
  );
}

export function ExampleMultiPreview({
  numViews,
  appId,
  pathName,
}: {
  numViews: number;
  appId: string;
  pathName: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {Array(numViews)
        .fill(null)
        .map((_, i) => (
          <div
            key={i}
            className="flex h-36 rounded-sm border bg-white shadow-xs"
          >
            {appId ? (
              <iframe
                className="flex-1"
                src={'/recipes/' + pathName + '?__appId=' + appId}
              />
            ) : (
              <div className="animate-slow-pulse flex-1 bg-gray-300"></div>
            )}
          </div>
        ))}
      <div className="flex justify-center">
        <SeeTheCodeButton href={`/recipes#${pathName}`} />
      </div>
    </div>
  );
}

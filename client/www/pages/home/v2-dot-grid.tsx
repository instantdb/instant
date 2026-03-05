import Head from 'next/head';
import { MainNav } from '@/components/marketingUi';
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
import { DotGridBg } from '@/components/home/DotGridBg';

export default function HomeDotGrid() {
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
        {/* Hero — dot grid canvas behind, fades out at bottom */}
        <section className="relative overflow-hidden bg-[#F8F8F8]">
          <DotGridBg />
          <div className="relative z-10 pt-10 pb-8 sm:pt-16 sm:pb-12">
            <Hero />
          </div>
          {/* Smooth fade to white */}
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
        <Section className="bg-[#F9FAFB]" id="social-proof">
          <SocialProof />
        </Section>
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

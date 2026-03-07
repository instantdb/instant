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
import { ComponentType, PropsWithChildren } from 'react';

export function HomePageLayout({
  Background,
}: {
  Background: ComponentType<PropsWithChildren>;
}) {
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
      <Background>
        <main className="flex-1">
          <Hero />
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
      </Background>
      <Footer />
    </div>
  );
}

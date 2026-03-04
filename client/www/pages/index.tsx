import Head from 'next/head';
import { MainNav } from '@/components/marketingUi';
import { Hero } from '@/components/new-landing/Hero';
import { Section } from '@/components/new-landing/Section';
import { BuiltForAI } from '@/components/new-landing/BuiltForAI';
import { BatteriesForAI } from '@/components/new-landing/BatteriesForAI';
import { SyncEngine } from '@/components/new-landing/SyncEngine';
import { SyncRelations } from '@/components/new-landing/SyncRelations';
import { SocialProof } from '@/components/new-landing/SocialProof';
import { StartupShowcase } from '@/components/new-landing/StartupShowcase';
import { FirebaseTestimonial } from '@/components/new-landing/FirebaseTestimonial';
import { FinalCTA } from '@/components/new-landing/FinalCTA';
import { Footer } from '@/components/new-landing/Footer';
import { AgentPathsBgSoftCenter } from '@/components/home/AgentPathsBgSoftCenter';
import type { ReactNode } from 'react';

function HomeSeo() {
  return (
    <Head>
      <title>Instant</title>
      <meta
        key="og:title"
        property="og:title"
        content="InstantDB: the best backend for AI-coded apps"
      />
      <meta
        key="og:description"
        property="og:description"
        content="We make you and your agent more productive by giving your frontend a real-time database."
      />
    </Head>
  );
}

function LandingBand({
  id,
  className,
  fadeHeightClass,
  background,
  children,
}: {
  id?: string;
  className: string;
  fadeHeightClass: string;
  background?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div id={id} className={`relative overflow-hidden ${className}`}>
      {background}
      <div
        className={`pointer-events-none absolute top-0 right-0 left-0 z-[5] ${fadeHeightClass} bg-gradient-to-b from-white to-transparent`}
      />
      <div
        className={`pointer-events-none absolute right-0 bottom-0 left-0 z-[5] ${fadeHeightClass} bg-gradient-to-b from-transparent to-white`}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default function Landing2026() {
  return (
    <div className="text-off-black relative">
      <MainNav transparent />
      <HomeSeo />
      <main className="flex-1">
        <section className="relative overflow-hidden bg-[#F8F8F8]">
          <AgentPathsBgSoftCenter />
          <div className="relative z-10 pt-10 pb-8 sm:pt-16 sm:pb-12">
            <Hero />
          </div>
          <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        </section>

        <Section id="built-for-ai">
          <BuiltForAI />
        </Section>

        <LandingBand className="bg-[#F0F5FA]" fadeHeightClass="h-24">
          <Section id="startup-showcase">
            <StartupShowcase />
          </Section>
        </LandingBand>

        <Section id="batteries-for-ai">
          <BatteriesForAI />
        </Section>

        <div className="bg-linear-to-b from-[#F7F7F7] to-white">
          <Section id="sync-engine">
            <SyncEngine />
          </Section>
        </div>

        <Section id="sync-relations">
          <SyncRelations />
        </Section>

        <LandingBand
          id="social-proof"
          className="bg-[#F8F8F8]"
          fadeHeightClass="h-32"
          background={
            <div className="opacity-40">
              <AgentPathsBgSoftCenter />
            </div>
          }
        >
          <div className="py-16 sm:py-24">
            <div className="landing-width mx-auto">
              <SocialProof />
              <div className="mt-16">
                <FirebaseTestimonial />
              </div>
            </div>
          </div>
        </LandingBand>

        <Section className="pt-0!">
          <FinalCTA />
        </Section>
      </main>
      <Footer />
    </div>
  );
}

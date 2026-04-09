import type { Metadata } from 'next';
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
import { fetchTotalSessionsCount } from '@/lib/hooks/fetchTotalSessionsCount';
import type { ReactNode } from 'react';
export const metadata: Metadata = {
  title: 'Instant',
  openGraph: {
    title: 'InstantDB: the best backend for AI-coded apps',
    description:
      'We make you and your agent more productive by giving your frontend a real-time database.',
  },
};

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

export default async function HomePage() {
  let initialConnectionCount: number | undefined;
  try {
    const body = await fetchTotalSessionsCount({ next: { revalidate: 30 } });
    initialConnectionCount = (body['total-count'] as number) || undefined;
  } catch {
    initialConnectionCount = undefined;
  }

  return (
    <div className="text-off-black w-full overflow-x-auto">
      <MainNav />
      <main className="flex-1">
        <section className="relative bg-linear-to-b from-[#FBF9F6] via-[#f2965040] to-white">
          <div className="relative z-10 pt-0 pb-8 sm:pt-8">
            <Hero />
          </div>
        </section>

        <LandingBand
          id="social-proof"
          className="bg-[#F8F8F8]"
          fadeHeightClass="h-48"
          background={
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.5)_0%,transparent_70%)]" />
          }
        >
          <div className="pt-16 sm:pt-24 sm:pb-18">
            <SocialProof initialConnectionCount={initialConnectionCount} />
            <div className="mt-16">
              <FirebaseTestimonial />
            </div>
          </div>
        </LandingBand>

        <div className="landing-width mx-auto pt-16 pb-16">
          <BuiltForAI />
        </div>

        <LandingBand className="bg-[#F0F5FA]" fadeHeightClass="h-48">
          <Section id="startup-showcase">
            <StartupShowcase />
          </Section>
        </LandingBand>

        <div className="landing-width mx-auto pt-18 pb-24">
          <BatteriesForAI />
        </div>

        <div className="bg-linear-to-b from-[#F7F7F7] to-white">
          <Section id="sync-engine">
            <SyncEngine />
          </Section>
        </div>

        <div className="bg-linear-to-b from-white via-[#F7F7F7] to-white">
          <Section className="py-8 sm:py-8" id="sync-relations">
            <SyncRelations />
          </Section>
        </div>

        <Section>
          <FinalCTA />
        </Section>
      </main>
      <Footer />
    </div>
  );
}

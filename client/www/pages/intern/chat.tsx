'use client';

import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  Section,
  H2,
} from '@/components/marketingUi';
import { FullscreenLoading } from '@/components/ui';
import { useAdmin } from '@/lib/auth';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { AuthGate } from '@/components/intern/docs-feedback/auth';
import { AIChatUsageDashboard } from '@/components/intern/docs-feedback/ai-chat-usage-dashboard';

export default function AIChatUsagePage() {
  const isHydrated = useIsHydrated();
  const { isAdmin, isLoading, error } = useAdmin();

  const pageTitle = 'AI Chat Usage';

  if (!isHydrated || isLoading) {
    return (
      <LandingContainer>
        <Head>
          <title>{pageTitle}</title>
        </Head>
        <MainNav />
        <Section>
          <div className="flex min-h-64 items-center justify-center">
            <FullscreenLoading />
          </div>
        </Section>
        <LandingFooter />
      </LandingContainer>
    );
  }

  if (error || !isAdmin) {
    return (
      <LandingContainer>
        <Head>
          <title>Access Denied</title>
        </Head>
        <MainNav />
        <Section>
          <div className="mt-12 mb-8 text-center">
            <H2>Access Denied</H2>
            <p className="mt-4 text-gray-600">
              You need to be an Instant admin to access this page.
            </p>
          </div>
        </Section>
        <LandingFooter />
      </LandingContainer>
    );
  }

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <AuthGate>
        <AIChatUsageDashboard />
      </AuthGate>
    </>
  );
}

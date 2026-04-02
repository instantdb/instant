'use client';

import { PostHogProvider } from 'posthog-js/react';
import { SWRConfig } from 'swr';
import { PostHogIdentify } from '@/components/PostHogIdentify';
import { localStorageProvider } from '@/lib/swrCache';
import posthog from '@/lib/posthog';

/**
 * Analytics and data-fetching providers, lazy-loaded to keep them
 * out of the initial page compilation in dev mode.
 *
 * SWR lives here because its only app-router consumer today is
 * PostHogIdentify -> useAuthInfo, which depends on useSwr.
 */
export default function Analytics() {
  return (
    <PostHogProvider client={posthog}>
      <SWRConfig value={{ provider: localStorageProvider }}>
        <PostHogIdentify />
      </SWRConfig>
    </PostHogProvider>
  );
}

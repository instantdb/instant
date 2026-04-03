'use client';

import { ReactNode, useEffect } from 'react';
import { PostHogProvider } from 'posthog-js/react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { SWRConfig } from 'swr';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PostHogIdentify } from '@/components/PostHogIdentify';
import { Button } from '@/components/ui';
import { localStorageProvider } from '@/lib/swrCache';
import { isDev } from '@/lib/config';
import { Dev } from '@/components/Dev';
import posthog from '@/lib/posthog';
import {
  patchFirefoxClicks,
  patchNumberInputScroll,
} from '@/lib/patchBrowserEvents';

function Oops() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <div className="text-4xl">🙈</div>
      <p className="text-2xl font-bold text-gray-600">Oops!</p>
      <p>An unexpected error occurred. We're on it!</p>
      <Button type="link" href="/dash">
        Back to the dash
      </Button>
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    patchNumberInputScroll();
    return patchFirefoxClicks();
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <PostHogIdentify />
      <ErrorBoundary renderError={() => <Oops />}>
        <SWRConfig
          value={{
            provider: localStorageProvider,
          }}
        >
          <NuqsAdapter>{children}</NuqsAdapter>
        </SWRConfig>
      </ErrorBoundary>
      {isDev ? <Dev /> : null}
    </PostHogProvider>
  );
}

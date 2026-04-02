'use client';

import { ReactNode, useEffect, lazy, Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { isDev } from '@/lib/config';
import {
  patchFirefoxClicks,
  patchNumberInputScroll,
} from '@/lib/patchBrowserEvents';

const Analytics = lazy(() => import('@/components/Analytics'));
const NuqsProvider = lazy(() =>
  import('nuqs/adapters/next/app').then((m) => ({
    default: m.NuqsAdapter,
  })),
);
const Dev = lazy(
  () => import('@/components/Dev').then((m) => ({ default: m.Dev })),
);

function Oops() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <div className="text-4xl">🙈</div>
      <p className="text-2xl font-bold text-gray-600">Oops!</p>
      <p>An unexpected error occurred. We're on it!</p>
      <a
        href="/dash"
        className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
      >
        Back to the dash
      </a>
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    patchNumberInputScroll();
    return patchFirefoxClicks();
  }, []);

  return (
    <ErrorBoundary renderError={() => <Oops />}>
      <Suspense fallback={children}>
        <NuqsProvider>{children}</NuqsProvider>
      </Suspense>
      <Suspense fallback={null}>
        <Analytics />
      </Suspense>
      {isDev ? (
        <Suspense fallback={null}>
          <Dev />
        </Suspense>
      ) : null}
    </ErrorBoundary>
  );
}

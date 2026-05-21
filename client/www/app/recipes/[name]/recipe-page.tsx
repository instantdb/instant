'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  InstantReactWebDatabase,
  InstantUnknownSchema,
  init,
} from '@instantdb/react';
import { Toaster } from '@instantdb/components';
import config from '@/lib/config';
import { errorToast } from '@/lib/toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { RecipeDBProvider } from '@/lib/recipes/db';
import { recipeComponents } from '@/lib/recipes/registry';
import {
  provisionEphemeralApp,
  verifyEphemeralApp,
  recipesAppIdStorageKey,
  provisionErrorMessage,
} from '@/lib/recipes/ephemeralApp';

type InstantDB = InstantReactWebDatabase<InstantUnknownSchema>;

export default function RecipePage({ name }: { name: string }) {
  return (
    <ErrorBoundary renderError={() => null}>
      <Main name={name} />
    </ErrorBoundary>
  );
}

function Main({ name }: { name: string }) {
  const router = useRouter();
  const isHydrated = useIsHydrated();
  const [appId, setAppId] = useState<string | undefined>(undefined);
  const dbRef = useRef<InstantDB | null>(null);

  function getDb(appId: string): InstantDB {
    if (!dbRef.current) {
      dbRef.current = init({
        ...config,
        appId,
        __extraDedupeKey: `recipe-page-${name}`,
      } as any);
    }
    return dbRef.current;
  }

  useEffect(() => {
    if (!isHydrated) return;
    onInit();
  }, [isHydrated]);

  function saveAppId(newAppId: string) {
    setAppId(newAppId);
    localStorage.setItem(recipesAppIdStorageKey, newAppId);
    const params = new URLSearchParams(window.location.search);
    if (params.get('app') !== newAppId) {
      params.set('app', newAppId);
      router.replace(
        `${window.location.pathname}?${params.toString()}${window.location.hash}`,
      );
    }
  }

  async function onInit() {
    const params = new URLSearchParams(window.location.search);
    const incomingAppId =
      params.get('app') || localStorage.getItem(recipesAppIdStorageKey);

    if (incomingAppId) {
      const verifyRes = await verifyEphemeralApp({ appId: incomingAppId });
      if (verifyRes.ok) {
        saveAppId(incomingAppId);
        return;
      }
    }

    const provisionRes = await provisionEphemeralApp();
    if (provisionRes.ok) {
      saveAppId(provisionRes.json.app.id);
    } else {
      errorToast(provisionErrorMessage);
    }
  }

  const RecipeComponent = recipeComponents[name];

  return (
    <>
      <Toaster />
      <div className="fixed inset-0 overflow-auto bg-white">
        {appId ? (
          <ErrorBoundary
            renderError={() => (
              <p className="p-4 text-sm text-red-500">Error loading preview</p>
            )}
          >
            <RecipeDBProvider value={getDb(appId)}>
              <RecipeComponent />
            </RecipeDBProvider>
          </ErrorBoundary>
        ) : (
          <div className="animate-slow-pulse h-full w-full bg-gray-200" />
        )}
      </div>
    </>
  );
}

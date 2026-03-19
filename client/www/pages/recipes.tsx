import { CodeEditor } from '@/components/new-landing/TabbedCodeExample';
import { File, getFiles } from '../recipes';
import { InstantApp } from '@/lib/types';
import config from '@/lib/config';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Head from 'next/head';
import { useInView } from 'react-intersection-observer';
import { ComponentType, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import {
  InstantReactWebDatabase,
  InstantUnknownSchema,
  init,
} from '@instantdb/react';
import { errorToast } from '@/lib/toast';
import { MainNav } from '@/components/marketingUi';
import * as og from '@/lib/og';
import { Toaster } from '@instantdb/components';
import { Footer } from '@/components/new-landing/Footer';
import { TopWash } from '@/components/new-landing/TopWash';
import { Section } from '@/components/new-landing/Section';
import { SectionTitle } from '@/components/new-landing/typography';
import { CopyToClipboardButton } from '@/components/new-landing/CopyToClipboardButton';
import { BrowserChrome } from '@/components/BrowserChrome';

import { RecipeDBProvider } from '@/lib/recipes/db';
import InstantTodos from '@/lib/recipes/todos';
import InstantAuth from '@/lib/recipes/auth';
import InstantCursors from '@/lib/recipes/cursors';
import InstantCustomCursors from '@/lib/recipes/custom-cursors';
import InstantTopics from '@/lib/recipes/reactions';
import InstantTypingIndicator from '@/lib/recipes/typing-indicator';
import InstantAvatarStack from '@/lib/recipes/avatar-stack';
import InstantMergeTileGame from '@/lib/recipes/merge-tile-game';

const recipeComponents: Record<string, ComponentType> = {
  todos: InstantTodos,
  auth: InstantAuth,
  cursors: InstantCursors,
  'custom-cursors': InstantCustomCursors,
  reactions: InstantTopics,
  'typing-indicator': InstantTypingIndicator,
  'avatar-stack': InstantAvatarStack,
  'merge-tile-game': InstantMergeTileGame,
};

const MAX_COLUMNS = 5;

export async function getStaticProps() {
  const files = getFiles();

  return {
    props: {
      files,
    },
  };
}

export default function Page({ files }: { files: File[] }) {
  return (
    <ErrorBoundary renderError={() => null}>
      <Main files={files} />
    </ErrorBoundary>
  );
}

function Main({ files }: { files: File[] }) {
  const router = useRouter();
  const isHydrated = useIsHydrated();
  const recipesContainerElRef = useRef<HTMLDivElement>(null);
  const { ref: topInViewRef } = useInView({
    threshold: 1,
    onChange(inView, entry) {
      if (!isHydrated || !router.isReady) return;

      if (inView && entry.isIntersecting && entry.intersectionRatio > 0) {
        location.hash = '';
      }
    },
  });
  const [selectedExample, setSelectedExample] = useState<string | undefined>();
  const [appId, setAppId] = useState<string | undefined>(undefined);
  const columnDbsRef = useRef<InstantDB[]>([]);

  function getColumnDb(appId: string, index: number): InstantDB {
    while (columnDbsRef.current.length <= index) {
      const i = columnDbsRef.current.length;
      columnDbsRef.current.push(
        init({
          ...config,
          appId,
          __extraDedupeKey: `recipes-col-${i}`,
        } as any),
      );
    }
    return columnDbsRef.current[index];
  }

  useEffect(() => {
    jumpToExample();
  }, []);

  useEffect(() => {
    if (router.isReady && isHydrated) {
      onInit();
    }
  }, [router.isReady, isHydrated]);

  function jumpToExample() {
    if (!recipesContainerElRef.current) return;
    const filePath = window.location.hash.replace(/^#/, '');

    if (!filePath) return;

    const p = `[data-path-name="${filePath}"]`;
    const el = recipesContainerElRef.current.querySelector(p);
    if (!el) return;

    const top =
      el?.getBoundingClientRect().top -
      document.body.getBoundingClientRect().top;
    scrollTo({
      top,
    });
  }

  function getUrlAppId() {
    return router.query.app as string | undefined;
  }

  function saveAppId(newAppId: string) {
    setAppId(newAppId);
    localStorage.setItem(storageKey, newAppId);
    if (getUrlAppId() !== newAppId) {
      router.replace(
        {
          query: { ...router.query, app: newAppId },
          hash: window.location.hash,
        },
        undefined,
        {
          shallow: true,
        },
      );
    }
  }

  async function onInit() {
    // 1. check for an app ID in the URL or local storage - URL takes precedence over local storage
    const incomingAppId = getUrlAppId() || localStorage.getItem(storageKey);

    // 2a. if we have an app ID, verify it
    if (incomingAppId) {
      const verifyRes = await verifyEphemeralApp({ appId: incomingAppId });

      // 2b. if the app ID is valid, use it
      if (verifyRes.ok) {
        // 2c. update the app ID in local storage and URL
        saveAppId(incomingAppId);
        return;
      }
    }

    // 3a. if we don't have an app ID, provision a new one
    const provisionRes = await provisionEphemeralApp();

    if (provisionRes.ok) {
      // 3b. update the app ID in local storage and url
      saveAppId(provisionRes.json.app.id);
    } else {
      // 4. the backend is probably down
      errorToast(provisionErrorMessage);
    }
  }

  return (
    <div className="text-off-black w-full overflow-x-auto">
      <Head>
        <title>Instant Recipes</title>
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ section: 'recipes' })}
        />
      </Head>
      <Toaster />

      {appId ? <RoomStatus db={getColumnDb(appId, 0)} appId={appId} /> : null}
      <MainNav transparent />

      {/* Hero */}
      <div className="relative overflow-hidden pt-16">
        <TopWash />
        <Section className="relative pt-12 pb-6 sm:pt-16 sm:pb-10">
          <div className="flex flex-col items-center text-center">
            <SectionTitle>Recipes</SectionTitle>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-balance sm:text-xl">
              With the right abstractions, you and your agents can make a lot of
              progress with a lot less code. Take a look at some of what's
              possible below.
            </p>
            <div
              ref={topInViewRef}
              className="mt-8 flex w-full max-w-md flex-col gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <p className="text-left text-sm text-gray-500">
                P.S we made an Instant app just for you! Share this with your
                friends and you can play with every example together.
              </p>
              <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                  {isHydrated && appId ? recipesUrl(appId) : 'Loading...'}
                </span>
                <CopyToClipboardButton
                  text={isHydrated && appId ? recipesUrl(appId) : ''}
                />
              </div>
            </div>
          </div>
        </Section>
      </div>

      <div className="landing-width mx-auto pb-16">
        <div className="flex flex-col gap-12" ref={recipesContainerElRef}>
          {files.map((file, i) => {
            return (
              <Example
                key={file.pathName}
                file={file}
                appId={isHydrated && appId ? appId : undefined}
                getColumnDb={getColumnDb}
                onViewChange={(inView) => {
                  if (!isHydrated || !router.isReady) return;
                  if (!inView) return;
                  window.location.hash = file.pathName;

                  setSelectedExample(file.pathName);
                }}
                lazy={i > 0}
              />
            );
          })}
        </div>
      </div>
      <Footer />
    </div>
  );
}

function Example({
  file,
  appId,
  getColumnDb,
  onViewChange,
  lazy,
}: {
  file: File;
  appId: string | undefined;
  getColumnDb: (appId: string, index: number) => InstantDB;
  onViewChange: (inView: boolean) => void;
  lazy: boolean;
}) {
  const [numViews, setNumViews] = useState(2);

  const { ref } = useInView({
    threshold: 0.8,

    onChange(inView, entry) {
      if (inView && entry.isIntersecting && entry.intersectionRatio > 0) {
        onViewChange(inView);
      }
    },
  });

  const RecipeComponent = recipeComponents[file.pathName];

  return (
    <div
      ref={ref}
      key={file.pathName}
      data-path-name={file.pathName}
      className="flex flex-col gap-4"
    >
      <div className="flex items-baseline gap-3">
        <h3 className="text-2xl font-normal sm:text-3xl">{file.name}</h3>
        <span className="text-base text-gray-400">
          {file.code.split('\n').length} lines
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-base text-gray-500">
            {numViews} {numViews === 1 ? 'preview' : 'previews'}
          </span>
          <div className="flex overflow-hidden rounded-md border border-gray-200">
            <button
              disabled={numViews <= 1}
              className="px-2.5 py-0.5 text-base text-gray-600 transition-colors hover:bg-gray-50 disabled:text-gray-300"
              onClick={() => {
                setNumViews(Math.max(numViews - 1, 1));
              }}
            >
              -
            </button>
            <button
              disabled={numViews >= 5}
              className="border-l border-gray-200 px-2.5 py-0.5 text-base text-gray-600 transition-colors hover:bg-gray-50 disabled:text-gray-300"
              onClick={() => {
                setNumViews(Math.min(numViews + 1, 5));
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 md:grid md:grid-cols-2">
        {/* Code panel — relative wrapper so grid row is sized by previews only */}
        <div className="relative h-[50vh] md:h-auto">
          <div
            className="flex flex-col overflow-hidden rounded-lg border border-gray-200 md:absolute md:inset-0"
            style={{ backgroundColor: '#faf8f5' }}
          >
            <div className="flex items-center border-b border-gray-200/60">
              <span className="px-4 py-2 text-sm font-medium text-gray-900 shadow-[inset_0_-2px_0_0_#f97316]">
                {file.fileName}
              </span>
              <div className="ml-auto pr-2">
                <CopyToClipboardButton text={file.code} />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <CodeEditor code={file.code} language="tsx" />
            </div>
          </div>
        </div>
        {/* Preview panels */}
        <div className="relative">
          {Array(numViews)
            .fill(null)
            .map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                style={{
                  aspectRatio: '16 / 10',
                  marginTop: i > 0 ? '-12px' : '0',
                  transform:
                    i % 2 === 1 ? 'translateX(8px)' : 'translateX(-8px)',
                  position: 'relative',
                  zIndex: i,
                }}
              >
                <BrowserChrome />
                <div className="h-[calc(100%-32px)] overflow-auto">
                  {appId && RecipeComponent ? (
                    <ErrorBoundary
                      renderError={() => (
                        <p className="p-2 text-sm text-red-500">
                          Error loading preview
                        </p>
                      )}
                    >
                      <RecipeDBProvider value={getColumnDb(appId, i)}>
                        <RecipeComponent />
                      </RecipeDBProvider>
                    </ErrorBoundary>
                  ) : (
                    <div className="animate-slow-pulse h-full w-full bg-gray-200"></div>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function RoomStatus({ db, appId }: { db: InstantDB; appId: string }) {
  const room = db.room('recipes', appId);
  const presence = room.usePresence();
  const numPeers = Object.keys(presence.peers).length;

  if (numPeers === 0) return null;
  if (presence.isLoading) return null;

  return (
    <div className="first-letter fixed right-0 bottom-0 left-0 z-10 mb-3 flex justify-center">
      <div
        key={numPeers}
        className="rounded-full bg-black/60 px-4 py-1 text-sm text-white shadow-lg backdrop-blur-sm"
        style={{
          animation: 'bounce 0.5s',
        }}
      >
        Friends on this page: <strong>{numPeers}</strong>
      </div>
    </div>
  );
}

type InstantDB = InstantReactWebDatabase<InstantUnknownSchema>;

const defaultAppTitle = 'Instant Example App';
const storageKey = 'recipes-appId';

const provisionErrorMessage =
  'Oops! Something went wrong when provisioning your app ID. Please reload the page and try again!';

function recipesUrl(appId: string) {
  return 'https://instantdb.com/recipes?app=' + appId;
}

async function provisionEphemeralApp() {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: defaultAppTitle,
    }),
  });

  const json: { app: InstantApp } = await r.json();

  return {
    ok: r.ok,
    json,
  };
}

async function verifyEphemeralApp({ appId }: { appId: string }) {
  const r = await fetch(`${config.apiURI}/dash/apps/ephemeral/${appId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const json: { app: InstantApp } = await r.json();

  return {
    ok: r.ok,
    json,
  };
}

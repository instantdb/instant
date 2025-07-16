import { Button, Copyable, Fence } from '@/components/ui';
import { File, getFiles } from '../examples';
import { InstantApp } from '@/lib/types';
import config from '@/lib/config';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Head from 'next/head';
import { useInView } from 'react-intersection-observer';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import {
  InstantReactWebDatabase,
  InstantUnknownSchema,
  init,
} from '@instantdb/react';
import { errorToast } from '@/lib/toast';
import { ToastContainer } from 'react-toastify';
import {
  H3,
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import { useAuthToken } from '@/lib/auth';
import * as og from '@/lib/og';

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
  const isAuthed = !!useAuthToken();
  const isHydrated = useIsHydrated();
  const examplesContainerElRef = useRef<HTMLDivElement>(null);
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
  const dbRef = useRef<{ appId: string; db: InstantDB }>();

  useEffect(() => {
    if (!appId) return;
    if (dbRef.current && dbRef.current.appId === appId) return;

    dbRef.current = {
      db: init({
        ...config,
        appId,
      }),
      appId,
    };
  }, [appId]);

  useEffect(() => {
    jumpToExample();
  }, []);

  useEffect(() => {
    if (router.isReady && isHydrated) {
      onInit();
    }
  }, [router.isReady, isHydrated]);

  function jumpToExample() {
    if (!examplesContainerElRef.current) return;
    const filePath = window.location.hash.replace(/^#/, '');

    if (!filePath) return;

    const p = `[data-path-name="${filePath}"]`;
    const el = examplesContainerElRef.current.querySelector(p);
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
    <LandingContainer>
      <Head>
        <title>Instant Examples</title>
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ section: 'examples' })}
        />
      </Head>
      <ToastContainer />

      {dbRef.current ? (
        <RoomStatus db={dbRef.current?.db} appId={dbRef.current.appId} />
      ) : null}
      <MainNav />
      <div className="mx-auto flex max-w-5xl flex-col px-4 py-12">
        <div className="flex flex-col gap-12" ref={examplesContainerElRef}>
          <div className="flex flex-col items-center gap-6 max-w-md mx-auto">
            <H3>Instant Code Examples</H3>
            <div className="flex flex-col gap-2">
              <p>
                Each example is a self-contained Instant app that you can copy
                and paste into your own projects.
              </p>
              {isHydrated && !isAuthed && (
                <p>
                  To get rolling, create a free account, grab your app ID, and
                  install{' '}
                  <code className="text-sm bg-gray-500 text-white px-3 rounded-sm whitespace-nowrap">
                    @instantdb/react
                  </code>
                  .
                </p>
              )}
            </div>
            {isHydrated && !isAuthed && (
              <div className="flex gap-3 items-center flex-col md:flex-row">
                <Button size="large" variant="cta" type="link" href="/dash">
                  Sign up
                </Button>
                <Button
                  size="large"
                  variant="secondary"
                  type="link"
                  href="/docs"
                >
                  Read the docs
                </Button>
              </div>
            )}
          </div>

          <div
            ref={topInViewRef}
            className="max-w-2xl md:mx-auto rounded border p-4 overflow-hidden bg-white border-gray-300 text-gray-700"
          >
            <div className="flex flex-col gap-2">
              <h3 className="text-md font-bold">
                <em>Psst</em>... this is a realtime page! 🔥
              </h3>
              <p className="text-sm">
                We created a full-fledged Instant app just for you. Share this
                page's unique URL with your friends, and you'll see them in the
                previews below!
              </p>
              <Copyable
                label="URL"
                value={isHydrated && appId ? examplesUrl(appId) : 'Loading...'}
              />
              <p className="italic text-sm">
                <strong>Please note:</strong> this app will automatically expire
                and be deleted in 2 weeks.
              </p>
            </div>
          </div>

          {files.map((file, i) => {
            return (
              <Example
                key={file.pathName}
                file={file}
                appId={isHydrated && appId ? appId : undefined}
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
      <LandingFooter />
    </LandingContainer>
  );
}

function Example({
  file,
  appId,
  onViewChange,
  lazy,
}: {
  file: File;
  appId: string | undefined;
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

  return (
    <div
      ref={ref}
      key={file.pathName}
      data-path-name={file.pathName}
      className="flex flex-col py-2"
    >
      <div className="flex flex-col overflow-hidden rounded-sm border">
        <div className="flex gap-2 border-b bg-gray-50 px-4 py-2 items-center">
          <h3 className="font-mono font-bold truncate">{file.name}</h3>
          <Button
            size="mini"
            onClick={() => {
              navigator.clipboard.writeText(file.code);
            }}
          >
            Copy
          </Button>

          <span className="text-sm whitespace-nowrap">
            <span className="bg-white border px-1 rounded-sm">{numViews}</span>{' '}
            previews
          </span>
          <Button
            disabled={numViews <= 1}
            size="mini"
            variant="secondary"
            onClick={() => {
              setNumViews(Math.max(numViews - 1, 1));
            }}
          >
            -
          </Button>
          <Button
            disabled={numViews >= 5}
            size="mini"
            variant="secondary"
            onClick={() => {
              setNumViews(Math.min(numViews + 1, 5));
            }}
          >
            +
          </Button>
        </div>
        <div className="flex flex-col md:flex-row overflow-hidden gap-2 bg-gray-100">
          <div className="flex md:flex-1 flex-col h-[50vh] md:h-[61vh] overflow-auto text-xs bg-prism">
            <Fence code={file.code} language="tsx" />
          </div>
          <div className="flex md:flex-1 flex-col gap-[1vh]">
            {Array(numViews)
              .fill(null)
              .map((_, i) => (
                <div
                  key={i}
                  className="flex h-[30vh] bg-white rounded border shadow-sm"
                >
                  {appId ? (
                    <iframe
                      className="flex-1"
                      src={'/examples/' + file.pathName + '?__appId=' + appId}
                      loading={lazy ? 'lazy' : undefined}
                    />
                  ) : (
                    <div className="flex-1 animate-slow-pulse bg-gray-300"></div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomStatus({ db, appId }: { db: InstantDB; appId: string }) {
  const room = db.room('examples', appId);
  const presence = room.usePresence();
  const numPeers = Object.keys(presence.peers).length;

  if (numPeers === 0) return null;
  if (presence.isLoading) return null;

  return (
    <div className="fixed z-10 bottom-0 right-0 left-0 flex first-letter justify-center mb-3">
      <div
        key={numPeers}
        className="bg-black/60 py-1 px-4 backdrop-blur text-white rounded-full shadow-lg text-sm"
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
const storageKey = 'examples-appId';

const provisionErrorMessage =
  'Oops! Something went wrong when provisioning your app ID. Please reload the page and try again!';

function examplesUrl(appId: string) {
  return 'https://instantdb.com/examples?app=' + appId;
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

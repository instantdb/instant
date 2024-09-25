import { useRouter } from 'next/router';
import { TokenContext } from '@/lib/contexts';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { DashResponse } from '@/lib/types';
import config from '@/lib/config';
import { useAuthToken, useTokenFetch } from '@/lib/auth';
import { Sandbox } from '@/components/dash/Sandbox';
import { Explorer } from '@/components/dash/explorer/Explorer';
import { init } from '@instantdb/react';
import { useEffect, useState } from 'react';
import { SectionHeading, Stack, TabBar, twel } from '@/components/ui';
import Auth from '@/components/dash/Auth';

type InstantReactClient = ReturnType<typeof init>;

export default function Devtool() {
  const router = useRouter();
  const authToken = useAuthToken();
  const isHydrated = useIsHydrated();
  const dashResponse = useTokenFetch<DashResponse>(
    `${config.apiURI}/dash`,
    authToken
  );
  const appId = router.query.appId as string;
  const app = dashResponse.data?.apps?.find((a) => a.id === appId);
  const [tab, setTab] = useState('explorer');
  const [connection, setConnection] = useState<
    | {
        state: 'pending';
      }
    | {
        state: 'error';
      }
    | {
        state: 'ready';
        db: InstantReactClient;
      }
  >({ state: 'pending' });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isToggleShortcut = e.shiftKey && e.ctrlKey && e.key === '0';

      if (isToggleShortcut) {
        parent.postMessage(
          {
            type: 'close',
          },
          '*'
        );
      }
    }

    addEventListener('keydown', onKeyDown);

    return () => removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!app) return;
    if (typeof window === 'undefined') return;

    try {
      const db = init({
        appId,
        apiURI: config.apiURI,
        websocketURI: config.websocketURI,
        // @ts-expect-error
        __adminToken: app?.admin_token,
        devtool: false,
      });

      setConnection({ state: 'ready', db });

      return () => {
        db._core.shutdown();
      };
    } catch (error) {
      setConnection({ state: 'error' });
    }
  }, [router.isReady, app]);

  if (!isHydrated) {
    return null;
  }

  if (!authToken) {
    return (
      <>
        <Auth
          emailOnly
          info={
            <div className="bg-gray-100 p-4 border rounded">
              <Help />
            </div>
          }
        />
      </>
    );
  }

  if (dashResponse.isLoading) {
    return (
      <div className="h-full w-full flex justify-center items-center">
        Loading...
      </div>
    );
  }

  if (dashResponse.error) {
    return (
      <div className="h-full w-full flex flex-col justify-center items-center gap-2">
        <div>Error loading app</div>
        {!isEmptyObj(dashResponse.error) ? (
          <pre className="p-1 bg-gray-100 max-w-sm w-full overflow-x-auto">
            {JSON.stringify(dashResponse.error, null, '\t')}{' '}
          </pre>
        ) : null}
      </div>
    );
  }

  if (!appId) {
    return (
      <div className="h-full w-full flex justify-center items-center">
        No app ID provided. Are you passing an app ID into <Code>init</Code>?
      </div>
    );
  }

  if (!app) {
    return (
      <div className="h-full w-full flex justify-center items-center">
        Cound not find app. Are you logged in to the correct account?
      </div>
    );
  }

  if (connection.state === 'error') {
    return (
      <div className="h-full w-full flex justify-center items-center">
        Failed to connect to Instant backend.
      </div>
    );
  }

  if (connection.state === 'pending') {
    return (
      <div className="h-full w-full flex justify-center items-center">
        Connecting...
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <TokenContext.Provider value={authToken}>
        <div className="flex flex-col h-full w-full">
          <div className="px-3 py-1 text-xs font-mono bg-gray-100 border-b">
            Instant Devtools {app?.title ? `• ${app?.title}` : ''}
          </div>
          <div className="flex gap-2 px-3 py-1 text-xs font-mono bg-gray-50 border-b">
            <span>App ID</span>
            <code
              className="bg-white rounded border px-2"
              onClick={(e) => {
                const node = e.currentTarget;
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(node);
                selection?.removeAllRanges();
                selection?.addRange(range);
              }}
            >
              {app.id ?? <>&nbsp;</>}
            </code>
          </div>
          <TabBar
            className="text-sm"
            selectedId={tab}
            tabs={[
              {
                id: 'explorer',
                label: 'Explorer',
              },
              {
                id: 'sandbox',
                label: 'Sandbox',
              },
              {
                id: 'help',
                label: 'Help',
              },
            ]}
            onSelect={(t) => {
              setTab(t.id);
            }}
          />
          <div className="flex w-full flex-1 overflow-auto">
            {tab === 'explorer' ? (
              <Explorer db={connection.db} />
            ) : tab === 'sandbox' ? (
              <div className="min-w-[960px] w-full">
                <Sandbox app={app} />
              </div>
            ) : tab === 'help' ? (
              <div className="min-w-[960px] w-full p-4">
                <Help />
              </div>
            ) : null}
          </div>
        </div>
      </TokenContext.Provider>
    </div>
  );
}

function Help() {
  return (
    <Stack className="gap-2 text-sm max-w-sm">
      <SectionHeading>Instant Devtools</SectionHeading>
      <p>
        This widget embeds a data explorer and sandbox for your Instant app. We
        added it to make it easier to interact with your data and test
        operations.
      </p>
      <p>
        You can toggle this view with the keyboard shortcut
        <Code>ctrl + shift + 0</Code>.
      </p>
      <p>
        It's is only displayed in development (i.e. when the site's hostname
        equals
        <Code>localhost</Code>). You can disable it entirely by calling
        Instant's
        <Code>init</Code> function with <Code>devtool: false</Code>.
      </p>
      <p>
        Feedback? Drop us a line on{' '}
        <a
          className="font-bold text-blue-500"
          href="https://discord.com/invite/VU53p7uQcE"
        >
          Discord
        </a>
        .
      </p>
    </Stack>
  );
}

const Code = twel('code', 'bg-gray-200 px-1 rounded text-xs font-mono');

function isEmptyObj(obj: object) {
  return Object.keys(obj).length === 0;
}

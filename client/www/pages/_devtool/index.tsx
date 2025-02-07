import { useRouter } from 'next/router';
import { TokenContext } from '@/lib/contexts';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { successToast } from '@/lib/toast';
import { DashResponse, InstantApp } from '@/lib/types';
import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { APIResponse, useAuthToken, useTokenFetch } from '@/lib/auth';
import { Sandbox } from '@/components/dash/Sandbox';
import { Explorer } from '@/components/dash/explorer/Explorer';
import { init } from '@instantdb/react';
import { useEffect, useState, useContext, useMemo } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  SectionHeading,
  SubsectionHeading,
  Stack,
  TabBar,
  Content,
  twel,
  useDialog,
} from '@/components/ui';
import Auth from '@/components/dash/Auth';
import { isMinRole } from '@/pages/dash/index';
import { TrashIcon, XMarkIcon } from '@heroicons/react/24/solid';

type InstantReactClient = ReturnType<typeof init>;

export default function Devtool() {
  const router = useRouter();
  const authToken = useAuthToken();
  const isHydrated = useIsHydrated();
  const dashResponse = useTokenFetch<DashResponse>(
    `${config.apiURI}/dash`,
    authToken,
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

  const isStorageEnabled = useMemo(() => {
    const storageEnabledAppIds =
      dashResponse.data?.flags?.storage_enabled_apps ?? [];

    return storageEnabledAppIds.includes(appId);
  }, [appId, dashResponse.data?.flags?.storage_enabled_apps]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isToggleShortcut = e.shiftKey && e.ctrlKey && e.key === '0';

      if (isToggleShortcut) {
        parent.postMessage(
          {
            type: 'close',
          },
          '*',
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
          <div className="flex p-2 text-xs bg-gray-100 border-b">
            <div className="flex-1 font-mono">
              Instant Devtools {app?.title ? `• ${app?.title}` : ''}
            </div>
            <XMarkIcon
              className="cursor-pointer"
              height="1rem"
              onClick={() => {
                parent.postMessage(
                  {
                    type: 'close',
                  },
                  '*',
                );
              }}
            />
          </div>
          <div className="flex gap-2 px-2 py-1 text-xs font-mono bg-gray-50 border-b">
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
                id: 'admin',
                label: 'Admin',
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
              <Explorer
                db={connection.db}
                appId={appId}
                isStorageEnabled={isStorageEnabled}
              />
            ) : tab === 'sandbox' ? (
              <div className="min-w-[960px] w-full">
                <Sandbox app={app} />
              </div>
            ) : tab === 'admin' ? (
              <div className="min-w-[960px] w-full p-4">
                <Admin dashResponse={dashResponse} app={app} />
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

function Admin({
  dashResponse,
  app,
}: {
  dashResponse: APIResponse<DashResponse>;
  app: InstantApp;
}) {
  const token = useContext(TokenContext);
  const [clearAppOk, updateClearAppOk] = useState(false);
  const clearDialog = useDialog();

  return (
    <Stack className="gap-2 text-sm max-w-sm">
      {isMinRole('owner', app.user_app_role) ? (
        <div className="space-y-2">
          <SectionHeading>Danger zone</SectionHeading>
          <Content>
            These are destructive actions and will irreversibly delete
            associated data.
          </Content>
          <div>
            <div className="flex flex-col space-y-6">
              <Button variant="destructive" onClick={clearDialog.onOpen}>
                <TrashIcon height={'1rem'} /> Clear app
              </Button>
            </div>
          </div>
          <Dialog {...clearDialog}>
            <div className="flex flex-col gap-2">
              <SubsectionHeading className="text-red-600">
                Clear app
              </SubsectionHeading>
              <Content className="space-y-2">
                <p>
                  Clearing an app will irreversibly delete all namespaces,
                  triples, and permissions.
                </p>
                <p>
                  All other data like app id, admin token, users, billing, team
                  members, etc. will remain.
                </p>
                <p>
                  This is equivalent to deleting all your namespaces in the
                  explorer and clearing your permissions.
                </p>
              </Content>
              <Checkbox
                checked={clearAppOk}
                onChange={(c) => updateClearAppOk(c)}
                label="I understand and want to clear this app."
              />
              <Button
                disabled={!clearAppOk}
                variant="destructive"
                onClick={async () => {
                  await jsonFetch(
                    `${config.apiURI}/dash/apps/${app.id}/clear`,
                    {
                      method: 'POST',
                      headers: {
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                      },
                    },
                  );

                  clearDialog.onClose();
                  dashResponse.mutate();
                  successToast('App cleared!');
                }}
              >
                Clear data
              </Button>
            </div>
          </Dialog>
        </div>
      ) : (
        <>
          <SectionHeading>Insufficent Role</SectionHeading>
          <Content>
            Only app owners can use admin features in the devtool.
          </Content>
        </>
      )}
    </Stack>
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

import { TokenContext } from '@/lib/contexts';
import { successToast } from '@/lib/toast';
import { DashResponse, InstantApp } from '@/lib/types';
import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { APIResponse, signOut, useAuthToken, useTokenFetch } from '@/lib/auth';
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
  ScreenHeading,
  FullscreenLoading,
} from '@/components/ui';
import Auth from '@/components/dash/Auth';
import { isMinRole } from '@/pages/dash/index';
import { TrashIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { CachedAPIResponse, useDashFetch } from '@/lib/hooks/useDashFetch';
import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';

type InstantReactClient = ReturnType<typeof init>;

const Devtool = asClientOnlyPage(DevtoolComp);

export default Devtool;

function DevtoolComp() {
  const router = useReadyRouter();
  const authToken = useAuthToken();
  if (!authToken) {
    return (
      <DevtoolWindow>
        <Auth
          emailOnly
          info={
            <div className="bg-gray-100 p-4 border rounded">
              <Help />
            </div>
          }
        />
      </DevtoolWindow>
    );
  }

  const appId = router.query.appId as string | undefined;

  if (!appId) {
    return (
      <DevtoolWindow>
        <div className="h-full w-full flex justify-center items-center">
          <div className="max-w-md mx-auto space-y-4">
            <ScreenHeading>No app id provided</ScreenHeading>
            <p>
              We didn't receive an app ID. Double check that you passed an{' '}
              <Code>appId</Code> paramater in your <Code>init</Code>. If you
              continue experiencing issues, ping us on Discord.
            </p>
            <Button
              className="w-full"
              size="mini"
              variant="secondary"
              onClick={() => {
                signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </DevtoolWindow>
    );
  }

  return (
    <TokenContext.Provider value={authToken}>
      <DevtoolAuthorized appId={appId} />
    </TokenContext.Provider>
  );
}

function DevtoolAuthorized({ appId }: { appId: string }) {
  const dashResponse = useDashFetch();

  if (dashResponse.isLoading) {
    return <FullscreenLoading />;
  }

  if (dashResponse.error) {
    const message = dashResponse.error.message;
    return (
      <DevtoolWindow>
        <div className="h-full w-full flex justify-center items-center">
          <div className="max-w-md mx-auto space-y-4">
            <ScreenHeading>🤕 Failed to load your app</ScreenHeading>
            {message ? (
              <div className="mx-auto flex w-full max-w-2xl flex-col">
                <div className="rounded bg-red-100 p-4 text-red-700">
                  {message}
                </div>
              </div>
            ) : null}
            <p>
              We had some trouble loading your app. Please ping us on{' '}
              <a
                className="font-bold text-blue-500"
                href="https://discord.com/invite/VU53p7uQcE"
                target="_blank"
              >
                discord
              </a>{' '}
              with details.
            </p>
            <Button
              className="w-full"
              size="mini"
              variant="secondary"
              onClick={() => {
                signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </DevtoolWindow>
    );
  }

  return <DevtoolWithData dashResponse={dashResponse} appId={appId} />;
}

function DevtoolWithData({
  dashResponse,
  appId,
}: {
  dashResponse: CachedAPIResponse<DashResponse>;
  appId: string;
}) {
  const app = dashResponse.data?.apps?.find((a) => a.id === appId);
  const [tab, setTab] = useState('explorer');
  const [connection, setConnection] = useState<
    | {
        state: 'pending';
      }
    | {
        state: 'error';
        errorMessage: string | undefined;
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
          '*',
        );
      }
    }

    addEventListener('keydown', onKeyDown);

    return () => removeEventListener('keydown', onKeyDown);
  }, []);

  const adminToken = app?.admin_token;

  useEffect(() => {
    if (!appId || !adminToken) return;
    if (typeof window === 'undefined') return;

    try {
      const db = init({
        appId,
        apiURI: config.apiURI,
        websocketURI: config.websocketURI,
        // @ts-expect-error
        __adminToken: adminToken,
        devtool: false,
      });

      setConnection({ state: 'ready', db });

      return () => {
        db._core.shutdown();
      };
    } catch (error) {
      const message = (error as Error).message;
      setConnection({ state: 'error', errorMessage: message });
    }
  }, [appId, adminToken]);

  if (!app && dashResponse.fromCache) {
    // We couldn't find this app. Perhaps the cache is stale. Let's
    // wait for fresh data.
    return <FullscreenLoading />;
  }

  if (!app) {
    const user = dashResponse.data?.user;
    return (
      <DevtoolWindow>
        <div className="h-full w-full flex justify-center items-center">
          <div className="max-w-md mx-auto space-y-4">
            <ScreenHeading>🔎 We couldn't find your app</ScreenHeading>
            <p>
              {user ? (
                <>
                  You're logged in as <strong>{user.email}</strong>.{' '}
                </>
              ) : null}
              We tried to access your app but couldn't.
            </p>
            <div className="bg-gray-50 p-2">
              <AppIdLabel appId={appId} />
            </div>
            <p>
              Are you sure you have access? Contact the app owner, or sign out
              and log into a different account:
            </p>
            <Button
              className="w-full"
              size="mini"
              variant="secondary"
              onClick={() => {
                signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </DevtoolWindow>
    );
  }

  if (connection.state === 'error') {
    const message = connection.errorMessage;
    return (
      <DevtoolWindow>
        <div className="h-full w-full flex justify-center items-center">
          <div className="max-w-md mx-auto space-y-4">
            <ScreenHeading>
              🤕 Failed connect to Instant's backend
            </ScreenHeading>
            {message ? (
              <div className="mx-auto flex w-full max-w-2xl flex-col">
                <div className="rounded bg-red-100 p-4 text-red-700">
                  {message}
                </div>
              </div>
            ) : null}
            <AppIdLabel appId={appId} />
            <p>
              We had some trouble connecting to Instant's backend. Please ping
              us on{' '}
              <a
                className="font-bold text-blue-500"
                href="https://discord.com/invite/VU53p7uQcE"
                target="_blank"
              >
                discord
              </a>{' '}
              with details.
            </p>
            <Button
              className="w-full"
              size="mini"
              variant="secondary"
              onClick={() => {
                signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </DevtoolWindow>
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
    <DevtoolWindow app={app}>
      <div className="flex flex-col h-full w-full">
        <div className="bg-gray-50 border-b">
          <AppIdLabel appId={app.id} />
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
            <Explorer db={connection.db} appId={appId} />
          ) : tab === 'sandbox' ? (
            <div className="min-w-[960px] w-full">
              <Sandbox app={app} db={connection.db} />
            </div>
          ) : tab === 'admin' ? (
            <div className="min-w-[960px] w-full p-4">
              <Admin dashResponse={dashResponse} app={app} />
            </div>
          ) : tab === 'help' ? (
            <div className="min-w-[960px] w-full p-4 space-y-4">
              <Help />
              <Button
                size="mini"
                variant="secondary"
                onClick={() => {
                  signOut();
                }}
              >
                Sign out
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </DevtoolWindow>
  );
}

function DevtoolWindow({
  app,
  children,
}: {
  app?: InstantApp;
  children: React.ReactNode;
}) {
  const isLocalHost =
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost' &&
    false;

  return (
    <div className="h-full w-full">
      <div className="flex flex-col h-full w-full">
        <div className="flex p-2 text-xs bg-gray-100 border-b">
          <div className="flex-1 font-mono">
            Instant Devtools {app?.title ? `• ${app?.title}` : ''}
            {isLocalHost ? ' • localhost' : ''}
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
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

function AppIdLabel({ appId }: { appId: string }) {
  return (
    <div className="flex gap-2 px-2 py-1 text-xs font-mono">
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
        {appId}
      </code>
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
        <Code>ctrl + shift + 0</Code>. To learn more, check out the{' '}
        <a
          className="font-bold text-blue-500"
          href="https://instantdb.com/docs/devtool"
          target="_blank"
        >
          docs.
        </a>
      </p>
    </Stack>
  );
}

const Code = twel('code', 'bg-gray-200 px-1 rounded text-xs font-mono');

function isEmptyObj(obj: object) {
  return Object.keys(obj).length === 0;
}

import { init, InstantReactWebDatabase } from '@instantdb/react';
import { useContext, useEffect, useRef, useState } from 'react';
import { v4 } from 'uuid';
import produce from 'immer';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { capitalize } from 'lodash';
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';

import { StyledToastContainer, errorToast, successToast } from '@/lib/toast';
import config, { cliOauthParamName, getLocal, setLocal } from '@/lib/config';
import { jsonFetch, jsonMutate } from '@/lib/fetch';
import {
  APIResponse,
  signOut,
  useAuthToken,
  claimTicket,
  voidTicket,
} from '@/lib/auth';
import { TokenContext } from '@/lib/contexts';
import { DashResponse, InstantApp, InstantMember } from '@/lib/types';

import { Perms } from '@/components/dash/Perms';
import { Schema } from '@/components/dash/Schema';
import Auth from '@/components/dash/Auth';
import { Explorer } from '@/components/dash/explorer/Explorer';
import { Onboarding } from '@/components/dash/Onboarding';

import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
  Content,
  Copyable,
  Dialog,
  FullscreenLoading,
  Label,
  ScreenHeading,
  SectionHeading,
  Select,
  SubsectionHeading,
  TabBar,
  TabItem,
  TextInput,
  ToggleCollection,
  twel,
  useDialog,
} from '@/components/ui';
import { AppAuth } from '@/components/dash/AppAuth';
import Billing from '@/components/dash/Billing';
import { QueryInspector } from '@/components/dash/explorer/QueryInspector';
import { Sandbox } from '@/components/dash/Sandbox';
import PersonalAccessTokensScreen from '@/components/dash/PersonalAccessTokensScreen';
import { useForm } from '@/lib/hooks/useForm';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { useDashFetch } from '@/lib/hooks/useDashFetch';
import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';
import { createdAtComparator } from '@/lib/app';
import OAuthApps from '@/components/dash/OAuthApps';
import clsx from 'clsx';
import AuthorizedOAuthAppsScreen from '@/components/dash/AuthorizedOAuthAppsScreen';
import { useNamespacesQuery, useSchemaQuery } from '@/lib/hooks/explorer';

// (XXX): we may want to expose this underlying type
type InstantReactClient = ReturnType<typeof init>;

type Role = 'collaborator' | 'admin' | 'owner';

const roleOrder = ['collaborator', 'admin', 'owner'] as const;

type MainTabId =
  | 'home'
  | 'explorer'
  | 'schema'
  | 'repl'
  | 'sandbox'
  | 'perms'
  | 'auth'
  | 'email'
  | 'team'
  | 'admin'
  | 'billing'
  | 'docs'
  | 'oauth-apps';

type UserSettingsTabId = 'pat' | 'oauth-apps';

type Screen =
  | 'main'
  | 'user-settings'
  | 'personal-access-tokens'
  | 'new'
  | 'invites';

function defaultTab(screen: 'main'): MainTabId;
function defaultTab(screen: 'user-settings'): UserSettingsTabId;
function defaultTab(screen: Screen): MainTabId | UserSettingsTabId;
function defaultTab(screen: Screen): MainTabId | UserSettingsTabId {
  if (screen === 'user-settings') {
    return 'oauth-apps';
  }
  return 'home';
}

interface Tab<TabId> {
  id: TabId;
  title: string;
  icon?: React.ReactNode;
  minRole?: 'admin' | 'owner';
}

const mainTabs: Tab<MainTabId>[] = [
  { id: 'home', title: 'Home' },
  { id: 'explorer', title: 'Explorer' },
  { id: 'schema', title: 'Schema' },
  { id: 'perms', title: 'Permissions' },
  { id: 'auth', title: 'Auth' },
  { id: 'repl', title: 'Query Inspector' },
  { id: 'sandbox', title: 'Sandbox' },
  { id: 'admin', title: 'Admin', minRole: 'admin' },
  { id: 'billing', title: 'Billing' },
  { id: 'docs', title: 'Docs' },
  { id: 'oauth-apps', title: 'OAuth Apps' },
];

const userTabs: Tab<UserSettingsTabId>[] = [
  { id: 'oauth-apps', title: 'OAuth Apps' },
  { id: 'pat', title: 'Access Tokens' },
];

const mainTabIndex = new Map(mainTabs.map((t) => [t.id, t]));
const userTabIndex = new Map(userTabs.map((t) => [t.id, t]));

export function isMinRole(minRole: Role, role: Role) {
  return roleOrder.indexOf(role) >= roleOrder.indexOf(minRole);
}

// COMPONENTS

const Dash = asClientOnlyPage(DashV2);

export default Dash;

function DashV2() {
  const token = useAuthToken();
  const readyRouter = useRouter();
  const cliAuthCompleteDialog = useDialog();
  const [loginTicket, setLoginTicket] = useState<string | undefined>();

  const cliNormalTicket = readyRouter.query.ticket as string | undefined;
  const cliOauthTicket = readyRouter.query[cliOauthParamName] as
    | string
    | undefined;
  const cliTicket = cliNormalTicket || cliOauthTicket;
  useEffect(() => {
    if (cliTicket) setLoginTicket(cliTicket);
  }, [cliTicket]);

  async function completeTicketFlow({
    ticket,
    token,
  }: {
    ticket: string;
    token: string;
  }) {
    try {
      await claimTicket({ ticket, token });
      cliAuthCompleteDialog.onOpen();
    } catch (error) {
      errorToast('Error completing CLI login.');
    }
  }

  if (!token) {
    return (
      <Auth
        key="anonymous"
        ticket={cliNormalTicket}
        onVerified={({ ticket }) => {
          setLoginTicket(ticket);
        }}
      />
    );
  }

  return (
    <>
      <Head>
        <style global>{
          /* css */ `
            html {
              overscroll-behavior-y: none;
            }
          `
        }</style>
      </Head>
      <TokenContext.Provider value={token}>
        <Dashboard key="root" />
        <Dialog
          open={cliAuthCompleteDialog.open}
          onClose={cliAuthCompleteDialog.onClose}
        >
          <div className="flex flex-col p-4 gap-4">
            <SectionHeading>Instant CLI verification complete!</SectionHeading>
            <Content>
              You can close this window and return to the terminal.
            </Content>
            <Button
              variant="secondary"
              onClick={() => {
                try {
                  window.close();
                } catch (error) {}
                cliAuthCompleteDialog.onClose();
              }}
            >
              Close
            </Button>
          </div>
        </Dialog>
        <Dialog
          open={Boolean(loginTicket && token)}
          onClose={() => {
            if (loginTicket) {
              voidTicket({ ticket: loginTicket, token });
            }
            setLoginTicket(undefined);
          }}
        >
          <div className="flex flex-col p-4 gap-4">
            <SectionHeading>Instant CLI login</SectionHeading>
            <Content>
              Do you want to grant Instant CLI access to your account?
            </Content>
            <Button
              variant="primary"
              onClick={() => {
                if (loginTicket) {
                  completeTicketFlow({ ticket: loginTicket, token });
                }
                setLoginTicket(undefined);
              }}
            >
              Log in
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (loginTicket) {
                  voidTicket({ ticket: loginTicket, token });
                }
                setLoginTicket(undefined);
              }}
            >
              Deny
            </Button>
          </div>
        </Dialog>
      </TokenContext.Provider>
    </>
  );
}

function isTabAvailable(tab: Tab<MainTabId>, role?: Role) {
  return tab.minRole ? role && isMinRole(tab.minRole, role) : true;
}

function screenTab(screen: Screen, tab: string | null | undefined) {
  if (screen === 'user-settings') {
    return tab && userTabIndex.has(tab as UserSettingsTabId)
      ? tab
      : defaultTab('user-settings');
  }
  return tab && mainTabIndex.has(tab as MainTabId) ? tab : defaultTab(screen);
}

function Dashboard() {
  const token = useContext(TokenContext);
  const router = useReadyRouter();
  const appId = router.query.app as string;
  const screen = ((router.query.s as string) || 'main') as Screen;
  const tab = screenTab(screen, router.query.t as string);

  // Local states
  const [hideAppId, setHideAppId] = useLocalStorage('hide_app_id', false);

  const [connection, setConnection] = useState<{
    db: InstantReactClient;
  } | null>(null);

  const dashResponse = useDashFetch();

  const [agentEssayDemo, setAgentEssayDemo] = useLocalStorage<{
    appId?: string;
    adminToken?: string;
    claimed?: boolean;
  }>('agents-essay-demo', {});

  useEffect(() => {
    if (!token) return;
    const state = getLocal('__tutorial-interaction-state');
    const tutorialAppId = state?.appId;
    const tutorialToken = state?.t;

    if (!tutorialAppId || !tutorialToken) return;

    jsonMutate(`${config.apiURI}/dash/apps/ephemeral/${tutorialAppId}/claim`, {
      token,
      method: 'POST',
      body: { token: tutorialToken },
    }).then(() => {
      localStorage.removeItem('__tutorial-interaction-state');
      return dashResponse.mutate();
    });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (agentEssayDemo.claimed) return;
    if (!agentEssayDemo.appId || !agentEssayDemo.adminToken) return;

    jsonMutate(
      `${config.apiURI}/dash/apps/ephemeral/${agentEssayDemo.appId}/claim`,
      {
        token,
        method: 'POST',
        body: { token: agentEssayDemo.adminToken },
      },
    ).then(() => {
      setAgentEssayDemo({ ...agentEssayDemo, claimed: true });
    });
  }, [token, agentEssayDemo]);

  const apps = (dashResponse.data?.apps ?? []).toSorted(createdAtComparator);

  const app = apps?.find((a) => a.id === appId);

  // ui
  const showAppOnboarding = !apps.length && !dashResponse.data?.invites?.length;
  const showNav = !showAppOnboarding;
  const showApp = app && connection && screen === 'main';
  const hasInvites = Boolean(dashResponse.data?.invites?.length);
  const showInvitesOnboarding = hasInvites && !apps?.length;

  useEffect(() => {
    if (screen && screen !== 'main') return;
    if (hasInvites) {
      nav({
        s: 'invites',
      });
      return;
    }

    const isAppIdValid = Boolean(apps.find((a) => a.id === appId));
    if (appId && isAppIdValid) return;

    const firstApp = apps?.[0];
    if (!firstApp) return;

    const _lastAppId = getLocal('dash_app_id');
    const lastAppId = Boolean(apps.find((a) => a.id === _lastAppId))
      ? _lastAppId
      : null;

    const defaultAppId = lastAppId ?? firstApp.id;
    if (!defaultAppId) return;

    router.replace({
      query: {
        s: 'main',
        app: defaultAppId,
        t: tab,
      },
    });

    setLocal('dash_app_id', defaultAppId);
  }, [dashResponse.data]);

  useEffect(() => {
    if (!app) return;
    if (typeof window === 'undefined') return;

    const db = init({
      appId: app.id,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
      // @ts-expect-error
      __adminToken: app?.admin_token,
    });

    setConnection({ db });
    return () => {
      db._core.shutdown();
    };
  }, [app?.id, app?.admin_token]);

  function nav(q: { s: string; app?: string; t?: string }, cb?: () => void) {
    if (q.app) setLocal('dash_app_id', q.app);

    router
      .push({
        query: q,
      })
      .then(() => {
        if (cb) {
          cb();
        }
      });
  }

  function onCreateApp(r: { name: string }) {
    const app: InstantApp = {
      id: v4(),
      pro: false,
      title: r.name.trim(),
      admin_token: v4(),
      created_at: new Date().toISOString(),
      rules: null,
      members: [],
      invites: [],
      user_app_role: 'owner',
      magic_code_email_template: null,
    };

    dashResponse.mutate(
      produce(dashResponse.data, (d) => {
        d?.apps!.push(app);
      }),
      {
        revalidate: false,
      },
    );

    createApp(token, app).catch((e) => {
      errorToast('Error creating app: ' + app.title);
    });

    nav({ s: 'main', app: app.id, t: 'home' });
  }

  async function onDeleteApp(app: InstantApp) {
    successToast(
      `${app.title} is marked for deletion. We will remove all data in 24 hours. Ping us on Discord if you did not mean to do this.`,
    );
    const _apps = apps.filter((a) => a.id !== app.id);
    dashResponse.mutate((data) =>
      produce(data, (d) => {
        if (d) {
          d.apps = _apps;
        }
      }),
    );
    const _appId = _apps[0]?.id;
    nav({ s: 'main', app: _appId, t: 'hello' });
  }
  if (screen === 'personal-access-tokens') {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
        <Head>
          <title>Instant - Personal Access Tokens</title>
        </Head>
        <StyledToastContainer />
        <PersonalAccessTokensScreen className="mx-auto" />
      </div>
    );
  }
  if (screen === 'user-settings') {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
        <Head>
          <title>Instant - User Settings</title>
        </Head>
        <StyledToastContainer />
        <Nav
          hasInvites={false}
          tab={tab as UserSettingsTabId}
          availableTabs={userTabs.map((t) => ({
            id: t.id,
            label: t.title,
          }))}
          appId={appId}
          nav={(params) => nav({ s: 'user-settings', app: appId, ...params })}
          screen={screen}
          title={'User Settings'}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex w-full flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-col flex-1 overflow-y-scroll">
                {tab === 'pat' ? (
                  <PersonalAccessTokensScreen />
                ) : tab === 'oauth-apps' ? (
                  <AuthorizedOAuthAppsScreen />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const availableTabs: TabItem[] = mainTabs
    .filter((t) => isTabAvailable(t, app?.user_app_role))
    .map((t) => {
      if (t.id === 'docs') {
        return {
          id: t.id,
          label: t.title,
          link: {
            href: app ? `/docs?app=${app.id}` : '/docs',
            target: '_blank',
          },
        };
      }
      return {
        id: t.id,
        label: t.title,
        link: { href: `/dash?s=main&app=${appId}&t=${t.id}` },
      };
    });

  return (
    <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
      <Head>
        <title>Instant - {mainTabIndex.get(tab as MainTabId)?.title}</title>
      </Head>
      <StyledToastContainer />
      {showNav ? (
        <Nav
          apps={apps}
          hasInvites={Boolean(dashResponse.data?.invites?.length)}
          appId={appId}
          tab={tab as MainTabId}
          availableTabs={availableTabs}
          nav={(params) => nav({ s: 'main', app: appId, ...params })}
          screen={screen}
        />
      ) : null}
      <div className="flex flex-1 flex-col overflow-hidden">
        {screen === 'new' ? (
          <CreateApp onDone={onCreateApp} />
        ) : dashResponse.isLoading ? (
          <FullscreenLoading />
        ) : dashResponse.error ? (
          <FullscreenErrorMessage message={errMessage(dashResponse.error)} />
        ) : showAppOnboarding ? (
          <Onboarding
            onCreate={async (p) => {
              await dashResponse.mutate();
              nav({ s: 'main', app: p.id, t: defaultTab('main') });
            }}
          />
        ) : screen === 'invites' || showInvitesOnboarding ? (
          <Invites nav={nav} dashResponse={dashResponse} />
        ) : showApp ? (
          <div
            key={appId} // Important! Re-mount all main content and reset UI state when the app id changes
            className="flex w-full flex-1 flex-col overflow-hidden"
          >
            <TabBar
              className="md:hidden"
              tabs={availableTabs}
              selectedId={tab}
              disabled={!Boolean(appId)}
              onSelect={(t) => {
                nav({ s: 'main', app: app.id, t: t.id });
              }}
            />
            <div className="border-b">
              <div className="flex max-w-2xl flex-col gap-2 p-3">
                <h2 className="font-mono text-lg font-bold">{app.title}</h2>
                <Copyable
                  label="Public App ID"
                  value={app.id}
                  hideValue={hideAppId}
                  onChangeHideValue={() => {
                    setHideAppId(!hideAppId);
                  }}
                />
              </div>
            </div>
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-col flex-1 overflow-y-scroll">
                {tab === 'home' ? (
                  <Home />
                ) : tab === 'explorer' ? (
                  <ExplorerTab appId={appId} db={connection.db} />
                ) : tab === 'schema' ? (
                  <Schema db={connection.db} />
                ) : tab === 'repl' ? (
                  <QueryInspector
                    className="flex-1 w-full"
                    appId={appId}
                    db={connection.db}
                  />
                ) : tab === 'sandbox' ? (
                  <Sandbox key={appId} app={app} db={connection.db} />
                ) : tab === 'perms' ? (
                  <Perms
                    app={app}
                    dashResponse={dashResponse}
                    db={connection.db}
                  />
                ) : tab === 'auth' ? (
                  <AppAuth
                    app={app}
                    key={app.id}
                    dashResponse={dashResponse}
                    nav={nav}
                  />
                ) : tab === 'admin' && isMinRole('admin', app.user_app_role) ? (
                  <Admin
                    dashResponse={dashResponse}
                    app={app}
                    onDelete={() => onDeleteApp(app)}
                    nav={nav}
                  />
                ) : tab === 'billing' &&
                  isMinRole('collaborator', app.user_app_role) ? (
                  <Billing appId={appId} />
                ) : tab === 'oauth-apps' ? (
                  <OAuthApps appId={appId} />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const TabContent = twel('div', 'flex flex-col max-w-2xl gap-4 p-4');

function mergeQueryParams(query: string) {
  const newQuery = new URLSearchParams(query);
  const currentQuery = new URLSearchParams(window.location.search);
  newQuery.forEach((value, key) => {
    currentQuery.set(key, value);
  });
  return Object.fromEntries(currentQuery);
}

// When navigating dash routes we want to persist query params containing
// things like the app id
function formatDashRoute(href: string) {
  const root = '/dash';
  if (!href.startsWith(root)) {
    return href;
  }

  const [pathName, queryString = ''] = href.split('?');
  const mergedQueryParams = mergeQueryParams(queryString);
  const mergedQueryString = Object.entries(mergedQueryParams)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');

  return `${pathName}?${mergedQueryString}`;
}

function formatDocsRoute(href: string) {
  const root = '/docs';

  if (!href.startsWith(root)) {
    return href;
  }

  const { app: appId } = Object.fromEntries(
    new URLSearchParams(window.location.search),
  );

  if (!appId) {
    return href;
  }

  const [pathName, hash] = href.split('#');

  if (hash) {
    return `${pathName}?app=${appId}#${hash}`;
  } else {
    return `${pathName}?app=${appId}`;
  }
}

function formatRouteParams(href: string) {
  return formatDashRoute(formatDocsRoute(href));
}

export function HomeButton({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <NextLink
      href={formatRouteParams(href)}
      className="justify-start p-4 border shadow-sm rounded space-y-2 bg-white hover:bg-gray-50 disabled:text-gray-400 cursor-pointer"
    >
      <div>
        <div className="font-mono font-bold text-xl">{title}</div>
        <div className="text-gray-500">{children}</div>
      </div>
    </NextLink>
  );
}

function Invites({
  nav,
  dashResponse,
}: {
  dashResponse: APIResponse<DashResponse>;
  nav: (p: { s: string; t?: string; app?: string }) => void;
}) {
  const token = useContext(TokenContext);
  const invites = dashResponse.data?.invites ?? [];

  return (
    <div className="flex w-full flex-col gap-4 max-w-2xl px-4 py-8">
      <div className="mb-2 flex text-4xl">📫</div>
      <SectionHeading>Team Invites</SectionHeading>
      <div className="flex flex-1 flex-col gap-4">
        {invites.length ? (
          invites.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-col justify-between gap-2"
            >
              <div>
                <strong>{invite.inviter_email}</strong> invited you to{' '}
                <strong>{invite.app_title}</strong> as{' '}
                <strong>{invite.invitee_role}</strong>.
              </div>
              <div className="flex gap-1">
                <ActionButton
                  variant="primary"
                  label="Accept"
                  submitLabel="Accepting..."
                  errorMessage="An error occurred when attempting to accept the invite."
                  successMessage={`You're part of the team for ${invite.app_title}!`}
                  onClick={async () => {
                    await jsonMutate(`${config.apiURI}/dash/invites/accept`, {
                      token,
                      body: {
                        'invite-id': invite.id,
                      },
                    });

                    await dashResponse.mutate();

                    if (invites.length === 1) {
                      nav({ s: 'main', t: 'home', app: invite.app_id });
                    }
                  }}
                />
                <ActionButton
                  label="Decline"
                  submitLabel="Decline..."
                  errorMessage="An error occurred when attempting to decline the invite."
                  onClick={async () => {
                    await jsonMutate(`${config.apiURI}/dash/invites/decline`, {
                      token,
                      body: {
                        'invite-id': invite.id,
                      },
                    });

                    await dashResponse.mutate();

                    const firstApp = dashResponse.data?.apps?.[0];
                    if (invites.length === 1 && firstApp) {
                      nav({ s: 'main', t: 'home', app: firstApp.id });
                    }
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <Content className="text-gray-400 italic">
            You have no pending invites.
          </Content>
        )}
      </div>
    </div>
  );
}

function Home() {
  return (
    <TabContent className="text-sm md:text-base">
      <SectionHeading>Getting Started</SectionHeading>
      <Content>
        Welcome to Instant! Here are some resources to help you get started.
      </Content>
      <div className="grid grid-cols-2 gap-4">
        <HomeButton href="/tutorial" title="Try the Demo">
          Follow our tutorial to build a full-stack app with Instant in less
          than 10 minutes.
        </HomeButton>
        <HomeButton href="/docs" title="Read the Docs">
          After the tutorial, jump into our docs to start learning how to use
          Instant.
        </HomeButton>
        <HomeButton
          href="https://discord.com/invite/VU53p7uQcE"
          title="Join the community"
        >
          Join our Discord to meet like-minded hackers, and to give us feedback
          too!
        </HomeButton>
      </div>
    </TabContent>
  );
}

function ExplorerTab({ db, appId }: { db: InstantReactClient; appId: string }) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex flex-1 flex-col overflow-hidden">
        <Explorer db={db} appId={appId} key={db._core._reactor.config.appId} />
      </div>
    </div>
  );
}

function AppCombobox({
  apps,
  appId,
  nav,
  tab,
}: {
  apps: InstantApp[];
  nav: (p: { s: string; t?: string; app?: string }, cb?: () => void) => void;
  appId: string;
  tab: MainTabId;
}) {
  const currentApp = apps.find((a) => a.id === appId) || null;

  const [appQuery, setAppQuery] = useState('');
  const comboboxInputRef = useRef<HTMLInputElement | null>(null);

  const filteredApps = appQuery
    ? apps.filter((a) => a.title.toLowerCase().includes(appQuery))
    : apps;

  return (
    <Combobox
      immediate={true}
      value={currentApp}
      onChange={(app: InstantApp | null) => {
        if (!app) {
          return;
        }
        setAppQuery('');
        nav(
          { s: 'main', app: app.id, t: tab },
          () => comboboxInputRef.current && comboboxInputRef.current.blur(),
        );
      }}
      onClose={() => setAppQuery('')}
    >
      <div className="relative">
        <ComboboxInput
          ref={comboboxInputRef}
          className={clsx(
            'w-0 basis-[35%] md:w-full md:basis-full truncate text-sm rounded-sm border-gray-300 py-1',
            'pr-8 pl-3 text-sm/6',
            'focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25',
          )}
          displayValue={(app: InstantApp | null) => (app ? app.title : '')}
          onChange={(e) => setAppQuery(e.target.value)}
        />
        <ComboboxButton className="group absolute inset-y-0 right-0 px-2.5">
          <ChevronDownIcon
            height={'1em'}
            className="fill-gray/300 group-data-[hover]:fill-gray"
          />
        </ComboboxButton>
      </div>
      <ComboboxOptions
        anchor="bottom"
        transition
        className={clsx(
          'min-w-[var(--input-width)] bg-white shadow-lg border border-gray-300 divide-y empty:invisible z-50',
          'border p-1 mx-2 my-1 [--anchor-gap:var(--spacing-1)] ',
          'transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0',
        )}
      >
        {filteredApps.map((app) => (
          <ComboboxOption
            key={app.id}
            value={app}
            className="group cursor-pointer px-3 py-1 data-[focus]:bg-blue-100"
          >
            <div className="">{app.title}</div>
          </ComboboxOption>
        ))}
      </ComboboxOptions>
    </Combobox>
  );
}

function Nav({
  apps,
  hasInvites,
  nav,
  appId,
  tab,
  availableTabs,
  title,
  screen,
}: {
  apps?: InstantApp[];
  hasInvites: boolean;
  nav: (p: { s?: string; t?: string; app?: string }, cb?: () => void) => void;
  appId: string;
  tab: MainTabId | UserSettingsTabId;
  availableTabs: TabItem[];
  title?: string;
  screen: string;
}) {
  const router = useRouter();
  const showAppNav = apps;
  return (
    <div className="flex flex-col gap-2 border-b border-gray-300 md:w-40 md:gap-0 md:border-b-0 md:border-r bg-gray-50">
      {title ? (
        <div className="flex flex-row justify-between gap-2 p-2 md:flex-col md:justify-start bg-gray-50">
          <h2>{title}</h2>
        </div>
      ) : null}
      {showAppNav ? (
        <div className="flex flex-row justify-between gap-2 p-2 md:flex-col md:justify-start bg-gray-50">
          <AppCombobox
            apps={apps}
            appId={appId}
            nav={nav}
            tab={tab as MainTabId}
          />

          <div className="flex md:flex-col gap-2">
            <Button
              size="mini"
              variant="secondary"
              onClick={() => nav({ s: 'new', app: appId })}
            >
              <PlusIcon height={14} /> New app
            </Button>
            {hasInvites ? (
              <Button size="mini" onClick={() => nav({ s: 'invites' })}>
                Invites
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="hidden md:visible md:static flex-row overflow-auto md:flex md:flex-col bg-gray-50 h-full">
        <ToggleCollection
          className="gap-0 text-sm"
          buttonClassName="rounded-none py-2"
          onChange={(t) => nav({ t: t.id })}
          selectedId={tab}
          items={availableTabs.map((t) => ({
            ...t,
            label: (
              <div className="flex gap-2 items-center">
                <span>{t.label}</span>
                {t.id === 'docs' && (
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                )}
              </div>
            ),
          }))}
        />
      </div>
      <div className="p-2 border-t bg-gray-50 flex flex-row items-center justify-center gap-2">
        <Button
          size="nano"
          variant="subtle"
          className="bg-transparent"
          onClick={() => {
            screen === 'user-settings'
              ? nav({ s: 'main', app: appId })
              : nav({ s: 'user-settings', t: 'oauth-apps', app: appId });
          }}
        >
          {screen === 'user-settings' ? (
            <ArrowLeftIcon height={18} />
          ) : (
            <Cog6ToothIcon height={18} />
          )}
        </Button>
        <Button
          className="w-full"
          size="mini"
          variant="secondary"
          onClick={() => {
            router.push('/');
            // delay sign out to allow the router to change the page
            // and avoid a flash of the unauthenticated dashboard
            setTimeout(() => {
              signOut();
            }, 150);
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

function InviteTeamMemberDialog({
  onClose,
  app,
  dashResponse,
}: {
  onClose: () => void;
  app: InstantApp;
  dashResponse: APIResponse<DashResponse>;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'collaborator'>('collaborator');
  const token = useContext(TokenContext);

  function onSubmit() {
    onClose();

    return dashResponse.optimisticUpdate(
      jsonMutate(`${config.apiURI}/dash/apps/${app.id}/invite/send`, {
        token,
        body: {
          'invitee-email': email,
          role,
        },
      }),
      (d) => {
        const _app = d?.apps?.find((a) => a.id === app.id);
        if (!_app) return;

        const _invite = _app.invites?.find((i) => i.email === email);

        if (_invite) {
          _invite.status = 'pending';
          _invite.role = role;
        } else {
          _app.invites?.push({
            id: v4(),
            email,
            role,
            status: 'pending',
            expired: false,
            sent_at: new Date().toISOString(),
          });
        }
      },
    );
  }

  return (
    <ActionForm className="flex flex-col gap-4">
      <h5 className="flex items-center text-lg font-bold">
        Invite a team member
      </h5>

      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e)}
      />

      <div className="flex flex-col gap-1">
        <Label>Role</Label>
        <Select
          value={role}
          onChange={(o) => {
            if (!o) return;
            setRole(o.value as 'admin' | 'collaborator');
          }}
          options={[
            { value: 'admin', label: 'Admin' },
            { value: 'collaborator', label: 'Collaborator' },
          ]}
        />
      </div>

      <ActionButton
        type="submit"
        label="Invite"
        submitLabel="Inviting..."
        successMessage="Invite sent!"
        errorMessage="Failed to send invite."
        disabled={!email}
        onClick={onSubmit}
      />
    </ActionForm>
  );
}

function Admin({
  dashResponse,
  app,
  onDelete,
  nav,
}: {
  dashResponse: APIResponse<DashResponse>;
  app: InstantApp;
  onDelete: () => void;
  nav: (p: { s: string; t?: string; app?: string }) => void;
}) {
  const token = useContext(TokenContext);
  const [deleteAppOk, updateDeleteAppOk] = useState(false);
  const [isDeletingApp, setIsDeletingApp] = useState(false);
  const [clearAppOk, updateClearAppOk] = useState(false);
  const [isClearingApp, setIsClearingApp] = useState(false);
  const [editMember, setEditMember] = useState<InstantMember | null>();
  const [hideAdminToken, setHideAdminToken] = useState(true);
  const clearDialog = useDialog();
  const deleteDialog = useDialog();
  const inviteDialog = useDialog();

  const displayedInvites = app.invites?.filter(
    (invite) => invite.status !== 'accepted',
  );

  async function onClickReset() {
    if (!dashResponse.data) return;
    const appIndex = dashResponse.data.apps?.findIndex((a) => a.id === app.id);
    const newAdminToken = v4();
    const confirmation =
      'Are you sure? This will invalidate your previous token.';

    if (!confirm(confirmation)) return;

    try {
      await regenerateAdminToken(token, app.id, newAdminToken);
    } catch (error) {
      errorToast(
        "Uh oh! We couldn't generate a new admin token. Please ping Joe & Stopa, or try again.",
      );

      return;
    }

    dashResponse.mutate(
      produce(dashResponse.data, (d) => {
        if (d.apps && appIndex) d.apps[appIndex].admin_token = newAdminToken;
      }),
    );
  }

  const appNameForm = useForm<{ name: string }>({
    initial: { name: app.title },
    validators: {
      name: (n) => (n.length ? undefined : { error: 'Name is required' }),
    },
    onSubmit: async (values) => {
      await dashResponse.optimisticUpdate(
        jsonMutate(`${config.apiURI}/dash/apps/${app.id}/rename`, {
          method: 'POST',
          token,
          body: {
            title: values.name,
          },
        }),
        (d) => {
          const _app = d?.apps?.find((a) => a.id === app.id);
          if (!_app) return;

          _app.title = values.name;
        },
      );

      successToast('App name updated!');
    },
  });

  return (
    <TabContent className="h-full">
      <Dialog open={inviteDialog.open} onClose={inviteDialog.onClose}>
        <InviteTeamMemberDialog
          app={app}
          dashResponse={dashResponse}
          onClose={inviteDialog.onClose}
        />
      </Dialog>
      <Dialog open={Boolean(editMember)} onClose={() => setEditMember(null)}>
        {editMember ? (
          <div className="flex flex-col gap-4">
            <h5 className="flex items-center text-lg font-bold">
              Edit team member
            </h5>
            <ActionButton
              label={
                editMember.role === 'admin'
                  ? 'Change to collaborator'
                  : 'Promote to admin'
              }
              submitLabel="Updating role..."
              successMessage="Update team member role."
              errorMessage="An error occurred while attempting to update team member."
              onClick={async () => {
                await jsonMutate(
                  `${config.apiURI}/dash/apps/${app.id}/members/update`,
                  {
                    token,
                    body: {
                      id: editMember.id,
                      role:
                        editMember.role === 'admin' ? 'collaborator' : 'admin',
                    },
                  },
                );

                await dashResponse.mutate();

                setEditMember(null);
              }}
            />
            <ActionButton
              className="w-full"
              variant="destructive"
              label="Remove from team"
              submitLabel="Removing..."
              successMessage="Removed team member."
              errorMessage="An error occurred while attempting to remove team member."
              onClick={async () => {
                await jsonMutate(
                  `${config.apiURI}/dash/apps/${app.id}/members/remove`,
                  {
                    method: 'DELETE',
                    token,
                    body: {
                      id: editMember.id,
                    },
                  },
                );

                await dashResponse.mutate();

                setEditMember(null);
              }}
            />
          </div>
        ) : null}
      </Dialog>
      {isMinRole('owner', app.user_app_role) ? (
        <form className="flex flex-col gap-2" {...appNameForm.formProps()}>
          <TextInput
            {...appNameForm.inputProps('name')}
            label="App name"
            placeholder="My awesome app"
          />
          <Button {...appNameForm.submitButtonProps()}>Update app name</Button>
        </form>
      ) : null}
      {app.pro ? (
        <>
          <div className="flex flex-col gap-1">
            <SectionHeading>Team Members</SectionHeading>
            {app.members?.length ? (
              <div className="flex flex-col gap-1">
                {app.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex justify-between items-center gap-3"
                  >
                    <div className="flex justify-between flex-1">
                      <div>{member.email}</div>
                      <div className="text-gray-400">
                        {capitalize(member.role)}
                      </div>
                    </div>
                    <div className="w-28 flex">
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={() => setEditMember(member)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-400">No team members</div>
            )}
          </div>
          {displayedInvites?.length ? (
            <div className="flex flex-col">
              <SubsectionHeading>Invites</SubsectionHeading>
              <div className="flex flex-col gap-0.5">
                {displayedInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex justify-between items-center gap-3"
                  >
                    <div className="flex flex-1 justify-between gap-2 overflow-hidden">
                      <div className="truncate">{invite.email}</div>
                      <div className="text-gray-400">
                        {capitalize(invite.role)}
                      </div>
                    </div>
                    <div className="w-28 flex">
                      {!invite.expired && invite.status === 'pending' ? (
                        <ActionButton
                          className="w-full"
                          label="Revoke"
                          submitLabel="Revoking..."
                          successMessage="Revoked team member invite."
                          errorMessage="An error occurred while attempting to revoke team member invite."
                          onClick={async () => {
                            dashResponse.optimisticUpdate(
                              jsonMutate(
                                `${config.apiURI}/dash/apps/${app.id}/invite/revoke`,
                                {
                                  method: 'DELETE',
                                  token,
                                  body: {
                                    'invite-id': invite.id,
                                  },
                                },
                              ),
                            );
                          }}
                        />
                      ) : (
                        <Button className="w-full" variant="secondary" disabled>
                          {invite.expired
                            ? 'Expired'
                            : capitalize(invite.status)}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            {app.pro ? (
              <Button
                onClick={() => {
                  inviteDialog.onOpen();
                }}
              >
                Invite a team member
              </Button>
            ) : (
              <>
                <Content className="italic">
                  Team member management is a Pro feature.
                </Content>
                <Button
                  onClick={() => {
                    nav({ s: 'main', app: app.id, t: 'billing' });
                  }}
                >
                  Upgrade to Pro
                </Button>
              </>
            )}
          </div>
        </>
      ) : null}
      <SectionHeading>Admin SDK</SectionHeading>
      <HomeButton href="/docs/backend" title="Instant and your backend">
        Learn how to use the Admin SDK to integrate Instant with your backend.
      </HomeButton>
      <Content>
        Use the admin token below to authenticate with your backend. Keep this
        token a secret.{' '}
        {isMinRole('admin', app.user_app_role) ? (
          <>
            If need be, you can regenerate it by{' '}
            <a onClick={onClickReset}>clicking here</a>.
          </>
        ) : null}
      </Content>
      <Copyable
        onChangeHideValue={() => setHideAdminToken(!hideAdminToken)}
        hideValue={hideAdminToken}
        label="Secret"
        value={app.admin_token}
      />
      {isMinRole('owner', app.user_app_role) ? (
        // mt-auto pushes the danger zone to the bottom of the page
        <div className="mt-auto space-y-2 pb-4">
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
              <Button variant="destructive" onClick={deleteDialog.onOpen}>
                <TrashIcon height={'1rem'} /> Delete app
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
                disabled={!clearAppOk || isClearingApp}
                variant="destructive"
                onClick={async () => {
                  setIsClearingApp(true);
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

                  setIsClearingApp(false);
                  clearDialog.onClose();
                  dashResponse.mutate();
                  successToast('App cleared!');
                }}
              >
                {isClearingApp ? 'Clearing data...' : 'Clear data'}
              </Button>
            </div>
          </Dialog>
          <Dialog {...deleteDialog}>
            <div className="flex flex-col gap-2">
              <SubsectionHeading className="text-red-600">
                Delete app
              </SubsectionHeading>
              <Content>
                Deleting an app will irreversibly delete all associated data.
              </Content>
              <Checkbox
                checked={deleteAppOk}
                onChange={(c) => updateDeleteAppOk(c)}
                label="I understand and want to delete this app."
              />
              <Button
                disabled={!deleteAppOk || isDeletingApp}
                variant="destructive"
                onClick={async () => {
                  setIsDeletingApp(true);
                  await jsonFetch(`${config.apiURI}/dash/apps/${app.id}`, {
                    method: 'DELETE',
                    headers: {
                      authorization: `Bearer ${token}`,
                      'content-type': 'application/json',
                    },
                  });
                  setIsDeletingApp(false);
                  onDelete();
                }}
              >
                Delete
              </Button>
            </div>
          </Dialog>
        </div>
      ) : null}
    </TabContent>
  );
}

function CreateApp({ onDone }: { onDone: (o: { name: string }) => void }) {
  const [name, setName] = useState('');

  return (
    <div className="flex flex-1 items-center justify-center">
      <ActionForm className="flex max-w-sm flex-col gap-4">
        <div className="mb-2 flex justify-center text-4xl">🔥</div>
        <ScreenHeading>Time for a new app?</ScreenHeading>
        <Content>We can do that. What would you like to call it?</Content>
        <TextInput
          autoFocus
          placeholder="Name your app"
          value={name}
          onChange={(n) => setName(n)}
        />
        <Button
          type="submit"
          disabled={name.trim().length === 0}
          onClick={() => onDone({ name })}
        >
          Let's go!
        </Button>
      </ActionForm>
    </div>
  );
}

function FullscreenErrorMessage({ message }: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-2">
      <div className="rounded bg-red-100 p-4 text-red-700">{message}</div>
    </div>
  );
}

// UTILS

function createApp(
  token: string,
  toCreate: { id: string; title: string; admin_token: string },
) {
  return jsonFetch(`${config.apiURI}/dash/apps`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(toCreate),
  });
}

function regenerateAdminToken(
  token: string,
  appId: string,
  adminToken: string,
) {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/tokens`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ 'admin-token': adminToken }),
  });
}

/**
 * (XXX)
 * We could type the result of our fetches, and write a better error
 */
function errMessage(e: Error) {
  return e.message || 'An error occurred.';
}

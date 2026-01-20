import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import {
  ArrowTopRightOnSquareIcon,
  BeakerIcon,
  CodeBracketIcon,
  CreditCardIcon,
  CubeIcon,
  FunnelIcon,
  HomeIcon,
  IdentificationIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { Explorer as NewExplorer } from '@instantdb/components';
import { ChevronDownIcon } from '@heroicons/react/24/solid';
import { init } from '@instantdb/react';
import produce from 'immer';
import Head from 'next/head';
import NextLink from 'next/link';
import { ReactElement, useContext, useEffect, useRef, useState } from 'react';
import { usePostHog } from 'posthog-js/react';

import config, { areTeamsFree } from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch, jsonMutate } from '@/lib/fetch';
import { successToast } from '@/lib/toast';
import {
  AppsSubscriptionResponse,
  InstantApp,
  SchemaNamespace,
} from '@/lib/types';
import { titleComparator } from '@/lib/app';

import { AppStart } from '@/components/dash/HomeStartGuide';
import { Perms } from '@/components/dash/Perms';
import { Schema } from '@/components/dash/Schema';

import { Admin } from '@/components/admin/AdminPage';
import {
  asClientOnlyPage,
  ClientOnly,
  useReadyRouter,
} from '@/components/clientOnlyPage';
import { AppAuth } from '@/components/dash/AppAuth';
import Billing from '@/components/dash/Billing';
import { QueryInspector } from '@/components/dash/explorer/QueryInspector';
import {
  MainDashLayout,
  useFetchedDash,
} from '@/components/dash/MainDashLayout';
import OAuthApps from '@/components/dash/OAuthApps';
import { Sandbox } from '@/components/dash/Sandbox';
import {
  Badge,
  Copyable,
  SectionHeading,
  SmallCopyable,
  TabBar,
  TabItem,
  ToggleCollection,
  twel,
} from '@/components/ui';
import { SearchFilter, useSchemaQuery } from '@/lib/hooks/explorer';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { getLocallySavedApp, setLocallySavedApp } from '@/lib/locallySavedApp';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import { NextPageWithLayout } from '../_app';
import { capitalize } from 'lodash';
import { Workspace } from '@/lib/hooks/useWorkspace';
import AnimatedCounter from '@/components/AnimatedCounter';
import { useDarkMode } from '@/components/dash/DarkModeToggle';
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  useQueryStates,
} from 'nuqs';
import { useExplorerState } from '@/lib/hooks/useExplorerState';

// (XXX): we may want to expose this underlying type
type InstantReactClient = ReturnType<typeof init>;

export type Role = 'collaborator' | 'admin' | 'owner' | 'app-member';

export const roleOrder = [
  'collaborator',
  'admin',
  'owner',
  'app-member',
] as const;

// Types for connection count
type AppStatsResponse = {
  count: number;
  origins: Record<string, number>;
};

// API function to fetch app stats
async function fetchAppStats(
  token: string,
  appId: string,
): Promise<AppStatsResponse> {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/stats`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

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
  | 'oauth-apps';

type UserSettingsTabId = 'pat' | 'oauth-apps';

type Screen =
  | 'main' // app details
  | 'user-settings'
  | 'invites'
  | 'new'
  | 'personal-access-tokens';

function defaultTab(screen: Screen): MainTabId | UserSettingsTabId {
  return 'home';
}

interface Tab<TabId> {
  id: TabId;
  title: string;
  icon?: React.ReactNode;
  minRole?: 'admin' | 'owner';
}

const makeIcon = (Icon: typeof HomeIcon) => {
  return <Icon width={14} />;
};

const mainTabs: Tab<MainTabId>[] = [
  { id: 'home', title: 'Home', icon: makeIcon(HomeIcon) },
  { id: 'explorer', title: 'Explorer', icon: makeIcon(FunnelIcon) },
  { id: 'schema', title: 'Schema', icon: makeIcon(CodeBracketIcon) },
  { id: 'perms', title: 'Permissions', icon: makeIcon(LockClosedIcon) },
  { id: 'auth', title: 'Auth', icon: makeIcon(IdentificationIcon) },
  { id: 'repl', title: 'Query Inspector', icon: makeIcon(MagnifyingGlassIcon) },
  { id: 'sandbox', title: 'Sandbox', icon: makeIcon(BeakerIcon) },
  {
    id: 'admin',
    title: 'Admin',
    minRole: 'admin',
    icon: makeIcon(ShieldCheckIcon),
  },
  { id: 'billing', title: 'Billing', icon: makeIcon(CreditCardIcon) },
  { id: 'oauth-apps', title: 'OAuth Apps', icon: makeIcon(CubeIcon) },
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

const Dash: NextPageWithLayout = asClientOnlyPage(DashV2);

export default Dash;

Dash.getLayout = function getLayout(page: ReactElement) {
  return (
    <ClientOnly>
      <MainDashLayout className="bg-gray-100 dark:bg-neutral-800 dark:text-white">
        {page}
      </MainDashLayout>
    </ClientOnly>
  );
};

function DashV2() {
  return <Dashboard key="root" />;
}

function isTabAvailable(tab: Tab<MainTabId>, role: Role) {
  return tab.minRole ? role && isMinRole(tab.minRole, role) : true;
}

function screenTab(screen: Screen, tab: string | null | undefined) {
  return tab && mainTabIndex.has(tab as MainTabId) ? tab : defaultTab(screen);
}

const getInitialApp = (apps: InstantApp[], workspaceId: string) => {
  const firstApp = apps?.[0];
  if (!firstApp) return;

  const lastApp = getLocallySavedApp(workspaceId);
  const lastAppId =
    lastApp && Boolean(apps.find((a) => a.id === lastApp.id))
      ? lastApp.id
      : null;

  const defaultAppId = lastAppId ?? firstApp.id;
  if (!defaultAppId) return;
  return defaultAppId;
};

const roleIndexed: Role[] = ['collaborator', 'admin', 'owner'];

export const getRole = (
  dataFromDash: ReturnType<typeof useFetchedDash>['data'],
  app: InstantApp,
): Role => {
  if (dataFromDash.workspace.type === 'personal') {
    return app.user_app_role;
  } else {
    if (dataFromDash.workspace.org.role === 'app_member') {
      return app.user_app_role;
    }
    // return the max between the two roles
    return roleIndexed.reduce((max, role) => {
      if (dataFromDash.workspace.type === 'personal') {
        return app.user_app_role; // should never hit this
      }
      if (dataFromDash.workspace.org.role === role) return role;
      if (app.user_app_role === role) return role;
      return max;
    }, roleIndexed[0]);
  }
};

function Dashboard() {
  const token = useContext(TokenContext);
  const router = useReadyRouter();
  const fetchedDash = useFetchedDash();
  const posthog = usePostHog();
  const apps = fetchedDash.data.apps;

  const appId =
    (router.query.app as string) ||
    getInitialApp(apps, fetchedDash.data.currentWorkspaceId);

  const screen = ((router.query.s as string) || 'main') as Screen;
  const tab = screenTab(screen, router.query.t as string);

  const dashResponse = useFetchedDash();

  // Local states
  const [hideAppId, setHideAppId] = useLocalStorage('hide_app_id', false);

  const [connection, setConnection] = useState<{
    db: InstantReactClient;
  } | null>(null);

  const [agentEssayDemo, setAgentEssayDemo] = useLocalStorage<{
    appId?: string;
    adminToken?: string;
    claimed?: boolean;
  }>('agents-essay-demo', {});

  // backwards compatible routing
  useEffect(() => {
    if (screen === 'new') {
      router.replace('/dash/new');
      return;
    }
    if (screen === 'invites') {
      router.replace('/dash/user-settings?tab=invites');
      return;
    }
    if (screen === 'user-settings' || screen === 'personal-access-tokens') {
      if (tab === 'oauth-apps') {
        router.replace('/dash/user-settings?tab=oauth');
        return;
      }
      router.replace('/dash/user-settings');
    }
  }, []);

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

  const app = apps?.find((a) => a.id === appId);

  // ui
  const showApp = app && connection && screen === 'main';

  // set the query params if there are none
  useEffect(() => {
    if (!app) return;
    if (!router.query.app || !router.query.t) {
      router.replace({
        query: {
          s: 'main',
          app: app.id,
          t: tab,
        },
      });
    }
  }, [app, router.query.app]);

  useEffect(() => {
    if (screen && screen !== 'main') return;

    const isAppIdValid = Boolean(apps.find((a) => a.id === appId));
    if (appId && isAppIdValid) return;

    const lastApp = getLocallySavedApp(dashResponse.data.currentWorkspaceId);

    const lastAppId =
      lastApp && Boolean(apps.find((a) => a.id === lastApp.id))
        ? lastApp.id
        : null;

    const firstApp = apps?.[0];

    const defaultAppId = lastAppId ?? firstApp?.id;

    const replaceDefault = () => {
      if (!defaultAppId) return;

      router.replace({
        query: {
          s: 'main',
          app: defaultAppId,
          t: tab,
        },
      });

      setLocallySavedApp({
        id: defaultAppId,
        orgId: dashResponse.data.currentWorkspaceId,
      });
    };

    if (appId && appId !== lastAppId) {
      let cancel = false;
      // If we didn't find the app, check if the app lives on
      // a different org and redirect to that.
      jsonFetch(`${config.apiURI}/dash/apps/${appId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (cancel) return;
          if (
            res?.app?.creator_id &&
            dashResponse.data?.currentWorkspaceId &&
            dashResponse.data?.currentWorkspaceId !== 'personal'
          ) {
            dashResponse.setWorkspace('personal');
          } else if (
            res?.app?.org_id &&
            res?.app?.org_id !== router.query.org
          ) {
            dashResponse.setWorkspace(res.app.org_id);
            router.replace({
              query: {
                s: 'main',
                app: appId,
                org: res?.app?.org_id,
                t: tab,
              },
            });
          } else {
            replaceDefault();
          }
        })
        .catch((e) => {
          if (!cancel) {
            replaceDefault();
          }
        });

      return () => {
        cancel = true;
      };
    }

    replaceDefault();
  }, [dashResponse.data?.currentWorkspaceId, appId, router.query.org]);

  useEffect(() => {
    if (!app) return;
    if (typeof window === 'undefined') return;

    const db = init({
      appId: app.id,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
      // @ts-expect-error
      __adminToken: app?.admin_token,
      disableValidation: true,
    });

    setConnection({ db });
    return () => {
      db.core.shutdown();
    };
  }, [app?.id, app?.admin_token]);

  function nav(
    q: { s: string; app?: string; t?: string },
    opts?: { cb?: () => void; trackClick?: boolean },
  ) {
    // TODO: update for orgs
    if (q.app)
      setLocallySavedApp({
        id: q.app,
        orgId: dashResponse.data.currentWorkspaceId,
      });

    // Track tab navigation only for user-initiated clicks
    if (q.t && opts?.trackClick) {
      posthog.capture('dashboard_tab_click', {
        tab: q.t,
        app_id: q.app || appId,
      });
    }

    router
      .push({
        query: q,
      })
      .then(() => {
        if (opts?.cb) {
          opts.cb();
        }
      });
  }

  async function onDeleteApp(app: InstantApp) {
    successToast(
      `${app.title} is marked for deletion. We will remove all data in 24 hours. Ping us on Discord if you did not mean to do this.`,
    );
    const _apps = apps.filter((a) => a.id !== app.id);
    if (dashResponse.data.workspace.type === 'personal') {
      dashResponse.mutate((data) =>
        produce(data, (d) => {
          if (d) {
            d.apps = _apps;
          }
        }),
      );
    } else {
      await dashResponse.refetch();
    }
    const _appId = _apps[0]?.id;
    nav({ s: 'main', app: _appId, t: 'hello' });
  }

  if (
    apps.length === 0 &&
    dashResponse.data.invites &&
    dashResponse.data.invites.length >= 1
  ) {
    router.replace('/dash/user-settings?tab=invites', undefined, {
      shallow: true,
    });
  }

  if (
    apps.length === 0 &&
    (dashResponse.data.orgs || []).length === 0 &&
    dashResponse.data.invites?.length == 0
  ) {
    router.replace('/dash/onboarding', undefined, { shallow: true });
    return;
  }

  if (apps.length === 0) {
    router.replace('/dash/new', undefined, { shallow: true });
    return;
  }

  if (!appId || !app) {
    return <div></div>;
  }

  // Role is the max between the org and the app
  const role = getRole(dashResponse.data, app);
  const availableTabs: TabItem[] = mainTabs
    .filter((t) => isTabAvailable(t, role))
    .map((t) => {
      return {
        id: t.id,
        label: t.title,
        icon: t.icon,
      };
    });

  return (
    <>
      <div className="bg-gray-50 dark:bg-neutral-800/90">
        <div className="flex flex-col justify-between border-b border-b-gray-300 px-3 py-2 md:flex-row md:gap-4 dark:border-b-neutral-700">
          <div className="flex items-center gap-2">
            <h2 className="font-mono font-bold md:text-xl">{app.title}</h2>
            {dashResponse.data.workspace.type === 'org' && (
              <Badge>{capitalize(dashResponse.data.workspace.org.role)}</Badge>
            )}
          </div>
          <SmallCopyable
            size="normal"
            label="Public App ID"
            value={app.id}
            hideValue={hideAppId}
            onChangeHideValue={() => {
              setHideAppId(!hideAppId);
            }}
          />
        </div>
      </div>
      <div className="flex w-full grow flex-col overflow-hidden md:flex-row">
        <Head>
          <title>Instant - {mainTabIndex.get(tab as MainTabId)?.title}</title>
        </Head>
        <Nav
          apps={apps}
          appId={appId}
          tab={tab as MainTabId}
          availableTabs={availableTabs}
          nav={(params, opts) =>
            nav({ s: 'main', app: appId, ...params }, opts)
          }
          screen={screen}
        />
        <>
          {showApp ? (
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
                  nav(
                    { s: 'main', app: app.id, t: t.id },
                    { trackClick: true },
                  );
                }}
              />
              <div className="flex flex-1 grow flex-col overflow-y-auto">
                {connection ? (
                  <DashboardContent
                    role={role}
                    connection={connection}
                    app={app}
                    appId={appId}
                    tab={tab}
                    nav={nav}
                    onDeleteApp={onDeleteApp}
                    workspace={dashResponse.data.workspace}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      </div>
    </>
  );
}

export const TabContent = twel('div', 'flex flex-col max-w-2xl gap-4 p-4');

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

// Hook to fetch connection stats for the current app
function useAppConnectionStats(token: string, appId: string) {
  const [stats, setStats] = useState<AppStatsResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!token || !appId) return;

    let cancel = false;

    const fetchConnectionStats = async () => {
      try {
        const data = await fetchAppStats(token, appId);
        if (cancel) return;

        setStats(data);
        setError(null);
      } catch (err) {
        if (cancel) return;
        setStats(null);
        setError(err as Error);
      }
    };

    fetchConnectionStats();

    // Refresh every 5 seconds
    const interval = setInterval(fetchConnectionStats, 5000);

    return () => {
      cancel = true;
      clearInterval(interval);
    };
  }, [token, appId]);

  const isLoading = stats === null && error === null;

  return { stats, isLoading, error };
}

export function HomeButton({
  href,
  title,
  children,
  onClick,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <NextLink
      href={formatRouteParams(href)}
      className="block cursor-pointer justify-start space-y-2 rounded-sm border bg-white p-4 shadow-xs transition-colors hover:bg-gray-50 disabled:text-gray-400 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700/50"
      onClick={onClick}
    >
      <div>
        <div className="font-mono font-bold">{title}</div>
        <div className="text-sm text-gray-500 dark:text-neutral-400">
          {children}
        </div>
      </div>
    </NextLink>
  );
}

function Home({ app, token }: { app: InstantApp; token: string }) {
  const { id: appId } = app;
  const posthog = usePostHog();
  const { stats, isLoading, error } = useAppConnectionStats(token, appId);
  const [hideAppId, setHideAppId] = useLocalStorage('hide_app_id', false);

  // Sort origins by connection count (highest to lowest)
  const sortedOrigins = stats?.origins
    ? Object.entries(stats.origins).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <div className="max-w-2xl p-4 text-sm md:text-base">
      <div className="pb-10">
        <AppStart app={app} />
      </div>

      <SectionHeading>Next Steps</SectionHeading>
      <div className="pt-1">
        Now that you have your app running, here's some helpful links on what to
        do next!
      </div>

      <div className="flex flex-col gap-4 pt-4 md:flex-row md:flex-wrap md:justify-center">
        <div className="md:w-[calc(50%-0.5rem)]">
          <HomeButton
            href="/docs"
            title="Read the Docs"
            onClick={() =>
              posthog.capture('getting_started_click', {
                action: 'read_docs',
                app_id: appId,
              })
            }
          >
            Jump into our docs to start learning how to use Instant.
          </HomeButton>
        </div>
        <div className="md:w-[calc(50%-0.5rem)]">
          <HomeButton
            href="https://discord.com/invite/VU53p7uQcE"
            title="Join the community"
            onClick={() =>
              posthog.capture('getting_started_click', {
                action: 'join_discord',
                app_id: appId,
              })
            }
          >
            Join our Discord to meet like-minded hackers, and to give us feedback
            too!
          </HomeButton>
        </div>
        {areTeamsFree() && (
          <div className="md:w-[calc(50%-0.5rem)]">
            <HomeButton
              href={`/dash?s=main&app={appId}&t=admin`}
              title="Add your team members"
              onClick={() =>
                posthog.capture('getting_started_click', {
                  action: 'add_team_members',
                  app_id: appId,
                })
              }
            >
              Building is more fun with a team.
            </HomeButton>
          </div>
        )}
      </div>

      {/* Your Public App ID Section */}
      <div className="mt-10">
        <SectionHeading>Your Public App ID</SectionHeading>
        <div className="pt-1">
          Use this App ID to connect to your database{' '}
          <a
            className="underline hover:cursor-pointer dark:text-white"
            href="/docs/init"
            target="_blank"
          >
            via init
          </a>
          . This ID is safe to use in public-facing applications.
        </div>
        <div className="mt-4">
          <Copyable
            value={appId}
            size="large"
            hideValue={hideAppId}
            onChangeHideValue={() => setHideAppId(!hideAppId)}
          />
        </div>
      </div>

      {/* Connection Count Display */}
      <div className="mt-10">
        <SectionHeading>Your App Statistics</SectionHeading>
        <div className="mt-4 space-y-2 rounded-sm border bg-white p-4 shadow-xs transition-colors dark:border-neutral-700 dark:bg-neutral-800">
          <div className="flex items-center justify-between">
            <div className="mt-1">
              {isLoading ? (
                <div>Loading...</div>
              ) : error ? (
                <div>Error: {error.message}</div>
              ) : (
                <div className="inline-flex items-center space-x-2">
                  <AnimatedCounter number={stats?.count || 0} height={38} />
                  <div className="flex-1">sessions are connected right now</div>
                </div>
              )}
            </div>
          </div>

          {/* Origins List */}
          {!isLoading && !error && sortedOrigins.length > 0 && (
            <div className="mt-4 border-gray-200 pt-4 dark:border-neutral-600">
              <div className="mb-2 text-sm font-medium text-gray-500 dark:text-neutral-400">
                Per Origin
              </div>
              <div className="space-y-2">
                {sortedOrigins.map(([origin, count]) => {
                  const isLocalhost = origin.includes('localhost');
                  return (
                    <div
                      key={origin}
                      className="flex items-center justify-between"
                    >
                      <div className="flex-1 truncate">
                        {isLocalhost ? (
                          <span className="text-sm text-gray-700 dark:text-neutral-300">
                            {origin}
                          </span>
                        ) : (
                          <a
                            href={origin}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            {origin}
                          </a>
                        )}
                      </div>
                      <div className="ml-2 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-neutral-700 dark:text-neutral-300">
                        {count.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Dashboard content component that manages schema subscription
function DashboardContent({
  connection,
  app,
  appId,
  tab,
  nav,
  role,
  onDeleteApp,
  workspace,
}: {
  connection: { db: InstantReactClient };
  app: InstantApp;
  appId: string;
  tab: string;
  role: Role;
  nav: (
    q: { s: string; app?: string; t?: string },
    opts?: { cb?: () => void; trackClick?: boolean },
  ) => void;
  onDeleteApp: (app: InstantApp) => void;
  workspace: Workspace;
}) {
  // Subscribe to schema changes at the dashboard level
  const schemaData = useSchemaQuery(connection.db);

  return (
    <>
      {tab === 'home' ? (
        <Home app={app} token={useContext(TokenContext)!} />
      ) : tab === 'explorer' ? (
        <ExplorerTab
          appId={appId}
          db={connection.db}
          namespaces={schemaData.namespaces}
        />
      ) : tab === 'schema' ? (
        <Schema attrs={schemaData.attrs} />
      ) : tab === 'repl' ? (
        <QueryInspector
          className="w-full flex-1"
          appId={appId}
          db={connection.db}
          namespaces={schemaData.namespaces}
          attrs={schemaData.attrs}
        />
      ) : tab === 'sandbox' ? (
        <Sandbox
          key={appId}
          app={app}
          db={connection.db}
          attrs={schemaData.attrs}
          namespaces={schemaData.namespaces}
        />
      ) : tab === 'perms' ? (
        <Perms
          app={app}
          db={connection.db}
          namespaces={schemaData.namespaces}
        />
      ) : tab === 'auth' ? (
        <AppAuth app={app} key={app.id} nav={nav} />
      ) : tab === 'admin' && isMinRole('admin', role) ? (
        <Admin
          role={role}
          app={app}
          onDelete={() => onDeleteApp(app)}
          nav={nav}
          workspace={workspace}
        />
      ) : tab === 'billing' && isMinRole('collaborator', role) ? (
        <Billing appId={appId} />
      ) : tab === 'oauth-apps' ? (
        <OAuthApps appId={appId} />
      ) : null}
    </>
  );
}

function ExplorerTab({
  db,
  appId,
  namespaces,
}: {
  db: InstantReactClient;
  appId: string;
  namespaces: SchemaNamespace[] | null;
}) {
  const { darkMode } = useDarkMode();

  const [explorerState, setExplorerState] = useExplorerState();

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        <NewExplorer
          useShadowDOM={false}
          setExplorerState={setExplorerState}
          explorerState={explorerState}
          apiURI={config.apiURI}
          websocketURI={config.websocketURI}
          darkMode={darkMode}
          appId={appId}
          adminToken={db.core._reactor.config.__adminToken}
        />
      </div>
    </>
  );
}

function AppCombobox({
  apps,
  appId,
  nav,
  tab,
}: {
  apps: InstantApp[];
  nav: (
    p: { s: string; t?: string; app?: string },
    opts?: { cb?: () => void; trackClick?: boolean },
  ) => void;
  appId: string;
  tab: MainTabId;
}) {
  const currentApp = apps.find((a) => a.id === appId) || null;

  const [appQuery, setAppQuery] = useState('');
  const comboboxInputRef = useRef<HTMLInputElement | null>(null);

  const filteredApps = appQuery
    ? apps.filter((a) => a.title.toLowerCase().includes(appQuery))
    : apps;

  const sortedApps = filteredApps.toSorted(titleComparator);

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
          {
            cb: () =>
              comboboxInputRef.current && comboboxInputRef.current.blur(),
          },
        );
      }}
      onClose={() => setAppQuery('')}
    >
      <div className="relative">
        <ComboboxInput
          ref={comboboxInputRef}
          className={clsx(
            'w-full min-w-0! basis-[35%] truncate rounded-xs border-gray-300 py-1 text-sm md:w-full md:basis-full dark:border-neutral-700 dark:bg-neutral-700/40',
            'pr-8 pl-3 text-sm/6',
            'ring-0 focus:outline-hidden data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-white/25',
          )}
          displayValue={(app: InstantApp | null) => (app ? app.title : '')}
          onChange={(e) => setAppQuery(e.target.value)}
        />
        <ComboboxButton className="group absolute inset-y-0 right-0 px-2.5">
          <ChevronDownIcon
            height={'1em'}
            className="fill-gray/300 group-data-hover:fill-gray"
          />
        </ComboboxButton>
      </div>
      <ComboboxOptions
        anchor="bottom"
        transition
        className={clsx(
          'z-50 border border-gray-300 bg-white shadow-lg empty:invisible md:min-w-(--input-width) dark:divide-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white',
          'mx-2 my-1 border [--anchor-gap:var(--spacing-1)]',
          'transition duration-100 ease-in data-leave:data-closed:opacity-0',
        )}
      >
        {sortedApps.map((app) => (
          <ComboboxOption
            key={app.id}
            value={app}
            className="group cursor-pointer px-3 py-1 data-focus:bg-gray-100 dark:data-focus:bg-neutral-700/80"
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
  nav,
  appId,
  tab,
  availableTabs,
}: {
  apps?: InstantApp[];
  nav: (
    p: { s?: string; t?: string; app?: string },
    opts?: { cb?: () => void; trackClick?: boolean },
  ) => void;
  appId: string;
  tab: MainTabId | UserSettingsTabId;
  availableTabs: TabItem[];
  screen: string;
}) {
  const showAppNav = apps;
  return (
    <div className="flex flex-col gap-2 border-b border-gray-300 bg-gray-50 md:w-48 md:gap-0 md:border-r md:border-b-0 dark:border-neutral-700/80 dark:bg-neutral-800/40">
      {showAppNav ? (
        <>
          {createPortal(
            <AppCombobox
              apps={apps}
              appId={appId}
              nav={nav}
              tab={tab as MainTabId}
            />,
            document.getElementById('left-top-bar')!,
          )}
        </>
      ) : null}
      <div className="hidden h-full flex-row overflow-auto bg-gray-50 md:visible md:static md:flex md:flex-col dark:bg-neutral-800/40">
        <ToggleCollection
          className="gap-0 text-sm"
          buttonClassName="rounded-none py-2"
          onChange={(t) => nav({ t: t.id }, { trackClick: true })}
          selectedId={tab}
          items={availableTabs.map((t) => ({
            ...t,
            label: (
              <div className="flex items-center gap-2">
                {t.icon !== undefined && <span>{t.icon}</span>}
                <span>{t.label}</span>
                {t.id === 'docs' && (
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                )}
              </div>
            ),
          }))}
        />
      </div>
    </div>
  );
}

export function FullscreenErrorMessage({ message }: { message: string }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-2">
      <div className="rounded-sm bg-red-100 p-4 text-red-700">{message}</div>
    </div>
  );
}

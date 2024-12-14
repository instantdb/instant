import { init, InstantReactWebDatabase } from '@instantdb/react';
import { useContext, useEffect, useMemo, useState } from 'react';
import { v4 } from 'uuid';
import produce from 'immer';
import Head from 'next/head';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import { capitalize } from 'lodash';
import { PlusIcon, TrashIcon } from '@heroicons/react/solid';

import { StyledToastContainer, errorToast, successToast } from '@/lib/toast';
import config, { cliOauthParamName, getLocal, setLocal } from '@/lib/config';
import { jsonFetch, jsonMutate } from '@/lib/fetch';
import {
  APIResponse,
  signOut,
  useAuthToken,
  useAuthedFetch,
  claimTicket,
  voidTicket,
} from '@/lib/auth';
import { TokenContext } from '@/lib/contexts';
import { DashResponse, DBAttr, InstantApp, InstantMember } from '@/lib/types';

import { Perms } from '@/components/dash/Perms';
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
  Label,
  ScreenHeading,
  SectionHeading,
  Select,
  SubsectionHeading,
  TabBar,
  TabBarTab,
  TextInput,
  ToggleCollection,
  twel,
  useDialog,
} from '@/components/ui';
import { AppAuth } from '@/components/dash/AppAuth';
import Billing from '@/components/dash/Billing';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { QueryInspector } from '@/components/dash/explorer/QueryInspector';
import { Sandbox } from '@/components/dash/Sandbox';
import { StorageTab } from '@/components/dash/Storage';
import PersonalAccessTokensScreen from '@/components/dash/PersonalAccessTokensScreen';
import { useForm } from '@/lib/hooks/useForm';
import { useSchemaQuery } from '@/lib/hooks/explorer';
import useLocalStorage from '@/lib/hooks/useLocalStorage';

// (XXX): we may want to expose this underlying type
type InstantReactClient = ReturnType<typeof init>;

type Role = 'collaborator' | 'admin' | 'owner';

const roleOrder = ['collaborator', 'admin', 'owner'] as const;

const defaultTab: TabId = 'home';

type TabId =
  | 'home'
  | 'explorer'
  | 'repl'
  | 'sandbox'
  | 'perms'
  | 'auth'
  | 'email'
  | 'team'
  | 'admin'
  | 'billing'
  | 'storage'
  | 'docs';

interface Tab {
  id: TabId;
  title: string;
  icon?: React.ReactNode;
  minRole?: 'admin' | 'owner';
}

const tabs: Tab[] = [
  { id: 'home', title: 'Home' },
  { id: 'explorer', title: 'Explorer' },
  { id: 'perms', title: 'Permissions' },
  { id: 'auth', title: 'Auth' },
  { id: 'storage', title: 'Storage' },
  { id: 'repl', title: 'Query Inspector' },
  { id: 'sandbox', title: 'Sandbox' },
  { id: 'admin', title: 'Admin', minRole: 'admin' },
  { id: 'billing', title: 'Billing' },
  { id: 'docs', title: 'Docs' },
];

const tabIndex = new Map(tabs.map((t) => [t.id, t]));

export function isMinRole(minRole: Role, role: Role) {
  return roleOrder.indexOf(role) >= roleOrder.indexOf(minRole);
}

// COMPONENTS

export default function DashV2() {
  const token = useAuthToken();
  const isHydrated = useIsHydrated();
  const router = useRouter();
  const cliAuthCompleteDialog = useDialog();
  const [loginTicket, setLoginTicket] = useState<string | undefined>();

  const cliNormalTicket = router.query.ticket as string | undefined;
  const cliOauthTicket = router.query[cliOauthParamName] as string | undefined;
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

  if (!isHydrated) {
    return null;
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
                } catch (error) { }
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

function isTabAvailable(tab: Tab, role?: Role) {
  return tab.minRole ? role && isMinRole(tab.minRole, role) : true;
}

function Dashboard() {
  const token = useContext(TokenContext);
  const router = useRouter();
  const appId = router.query.app as string;
  const screen = (router.query.s as string) || 'main';
  const _tab = router.query.t as TabId;
  const tab = tabIndex.has(_tab) ? _tab : defaultTab;

  // Local states
  const [hideAppId, setHideAppId] = useLocalStorage('hide_app_id', false);

  const [connection, setConnection] = useState<{
    db: InstantReactClient;
  } | null>(null);

  const dashResponse = useAuthedFetch<DashResponse>(`${config.apiURI}/dash`);

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

  const apps = useMemo(() => {
    const apps = [...(dashResponse.data?.apps ?? [])];
    apps.sort(caComp);
    return apps;
  }, [dashResponse.data?.apps]);
  const app = apps?.find((a) => a.id === appId);
  const isStorageEnabled = useMemo(() => {
    const storageEnabledAppIds =
      dashResponse.data?.flags?.storage_enabled_apps ?? [];

    return storageEnabledAppIds.includes(appId);
  }, [appId, dashResponse.data?.flags?.storage_enabled_apps]);

  // ui
  const availableTabs: TabBarTab[] = tabs
    .filter((t) => isTabAvailable(t, app?.user_app_role))
    .map((t) => {
      if (t.id === 'docs') {
        return {
          id: t.id,
          label: t.title,
          link: app ? `/docs?app=${app.id}` : '/docs',
        };
      }
      return { id: t.id, label: t.title };
    });
  const showAppOnboarding =
    !dashResponse.data?.apps?.length && !dashResponse.data?.invites?.length;
  const showNav = !showAppOnboarding;
  const showApp = app && connection && screen === 'main';
  const hasInvites = Boolean(dashResponse.data?.invites?.length);
  const showInvitesOnboarding = hasInvites && !dashResponse.data?.apps?.length;

  useEffect(() => {
    if (!router.isReady) return;
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
  }, [router.isReady, dashResponse.data]);

  useEffect(() => {
    if (!app) return;
    if (typeof window === 'undefined') return;

    const db = init({
      appId,
      apiURI: config.apiURI,
      websocketURI: config.websocketURI,
      // @ts-expect-error
      __adminToken: app?.admin_token,
    });

    setConnection({ db });
    return () => {
      db._core.shutdown();
    };
  }, [router.isReady, app?.id, app?.admin_token]);

  function nav(q: { s: string; app?: string; t?: string }) {
    if (q.app) setLocal('dash_app_id', q.app);

    router.push({
      query: q,
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
          <title>Instant - {tabIndex.get(tab)?.title}</title>
          <meta name="description" content="Welcome to Instant." />
        </Head>
        <StyledToastContainer />
        <PersonalAccessTokensScreen />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
      <Head>
        <title>Instant - {tabIndex.get(tab)?.title}</title>
        <meta name="description" content="Welcome to Instant." />
      </Head>
      <StyledToastContainer />
      {showNav ? (
        <Nav
          apps={apps}
          hasInvites={Boolean(dashResponse.data?.invites?.length)}
          appId={appId}
          tab={tab}
          availableTabs={availableTabs}
          nav={nav}
        />
      ) : null}
      <div className="flex flex-1 flex-col overflow-hidden">
        {screen === 'new' ? (
          <CreateApp onDone={onCreateApp} />
        ) : dashResponse.isLoading ? (
          <Loading />
        ) : dashResponse.error ? (
          <ErrorMessage message={errMessage(dashResponse.error)} />
        ) : showAppOnboarding ? (
          <Onboarding
            onCreate={async (p) => {
              await dashResponse.mutate();
              nav({ s: 'main', app: p.id, t: defaultTab });
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
                ) : tab === 'repl' ? (
                  <QueryInspector
                    className="flex-1 w-full"
                    appId={appId}
                    db={connection.db}
                  />
                ) : tab === 'sandbox' ? (
                  <Sandbox key={appId} app={app} />
                ) : tab === 'perms' ? (
                  <Perms app={app} dashResponse={dashResponse} />
                ) : tab === 'auth' ? (
                  <AppAuth
                    app={app}
                    key={app.id}
                    dashResponse={dashResponse}
                    nav={nav}
                  />
                ) : tab === 'storage' ? (
                  <StorageTab
                    key={app.id}
                    app={app}
                    isEnabled={isStorageEnabled}
                  />
                ) : tab == 'admin' && isMinRole('admin', app.user_app_role) ? (
                  <Admin
                    dashResponse={dashResponse}
                    app={app}
                    onDelete={() => onDeleteApp(app)}
                    nav={nav}
                    db={connection.db}
                  />
                ) : tab == 'billing' &&
                  isMinRole('collaborator', app.user_app_role) ? (
                  <Billing appId={appId} />
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
        Ready to hack? To get a real-time app in minutes, see our quick example.
        You can also book some time with the founders to get personalized help
        (free)
      </Content>
      <div className="grid grid-cols-2 gap-4">
        <HomeButton href="/docs" title="Quick start">
          Get running in less than 5 minutes!
        </HomeButton>
        <HomeButton href="/tutorial" title="Try the Demo">
          See the magic of Instant in your browser.
        </HomeButton>
        <HomeButton
          href="https://calendly.com/instantdb/talk-with-instant-founders"
          title="Q&A with founders"
        >
          Have some questions? Get personalized help from the founders (free)
        </HomeButton>
        <HomeButton
          href="https://discord.com/invite/VU53p7uQcE"
          title="Join the community"
        >
          Join our Discord to meet like-minded hackers, and to give us feedback
          too!
        </HomeButton>
      </div>
      <SectionHeading>Manage your Data</SectionHeading>
      <Content>
        Use the explorer to see your data live. You can also use this to manage
        your schema. To learn more, check out our docs on how to read, write,
        and model data.
      </Content>
      <div className="grid grid-cols-2 gap-4">
        <HomeButton href="/docs/instaml" title="Writing data">
          Our write API is very small! Read up on how to write data to your
          Instant apps.
        </HomeButton>
        <HomeButton href="/docs/instaql" title="Reading data">
          Once you have some data, learn all the different ways you can read it!
        </HomeButton>
        <HomeButton href="/docs/modeling-data" title="Modeling data">
          Learn how to define advanced relationships and leverage Instant's
          graph capabilities.
        </HomeButton>
        <HomeButton href="/dash?t=explorer" title="Explorer">
          See your live data and edit your schema.
        </HomeButton>
      </div>
      <SectionHeading>Add Authentication</SectionHeading>
      <Content>
        Instant comes with an authentication system. You can use magic codes,
        Google OAuth, or integrate your own custom flow. We have examples and
        docs to help you get started.
      </Content>
      <div className="grid grid-cols-2 gap-4">
        <HomeButton href="/docs/auth#magic-codes" title="Magic codes">
          Passwords are pas·sé, Instant supports magic-code auth out of the box.
          Read the docs to learn how to add auth into your app in just a few
          lines of code!
        </HomeButton>
        <HomeButton href="/dash?t=auth" title="Manage OAuth">
          Use the Auth tab to configure Google OAuth. More auth providers to
          come!
        </HomeButton>
        <HomeButton href="/docs/backend#custom-auth" title="Custom auth">
          Learn how to use the Admin SDK to integrate your auth with Instant.
        </HomeButton>
      </div>
      <SectionHeading>Ephemeral Collaboration</SectionHeading>
      <Content>
        <p>
          When you use Instant to read and write data, you get optimistic
          updates, offline support, and real-time collaboration out of the box.
          Every change you make is instantly synced to all connected clients.
          This makes it easy to build collaborative apps like Figma, Notion, or
          Linear.
        </p>
        <p>
          Sometimes you want collaboration to be ephemeral. For example, sharing
          cursors on a shared document, showing who is online, or showing who is
          typing. We've got some examples to get you started and docs to help
          you build your own experiences.
        </p>
      </Content>
      <div className="grid grid-cols-2 gap-4">
        <HomeButton href="/examples" title="Examples">
          Real examples you can copy/paste into your own apps.
        </HomeButton>
        <HomeButton
          href="/docs/presence-and-topics"
          title="Presence, Cursors, and Activity"
        >
          Learn how to use Instant's presence system to build your own ephemeral
          collaborative features.
        </HomeButton>
      </div>
      <SectionHeading>Secure your app</SectionHeading>
      <Content>
        Ready to ship your app to the world? You'll likely want to add some
        permissions to ensure only the right people see the right data.
      </Content>
      <div className="grid grid-cols-2 gap-4">
        <HomeButton href="/docs/permissions" title="How to use permissions">
          Instant uses CEL under the hood for writing permission rules. It's an
          alternative to row-based security!
        </HomeButton>
        <HomeButton href="/dash?t=perms" title="Manage permissions">
          Write permission rules to secure your app
        </HomeButton>
      </div>
      <SectionHeading>Manage your app</SectionHeading>
      <Content>
        Want to see your usage, change your billing, or delete your app? You can
        do that using the admin and billing tabs.
      </Content>
      <div className="grid grid-cols-2 gap-4">
        <HomeButton href="/dash?t=admin" title="Admin">
          App management and admin secrets for using Instant on the backend.
        </HomeButton>
        <HomeButton href="/dash?t=billing" title="Billing">
          See your current app usage and manage your subscription.
        </HomeButton>
      </div>
      <SectionHeading>Example Applications</SectionHeading>
      <Content>
        We've built a few example applications to help you get started. You can
        reference these to help you build your own apps.
      </Content>
      <div className="grid grid-cols-2 gap-4">
        <HomeButton
          href="https://github.com/jsventures/instldraw"
          title="instldraw (Web)"
        >
          tldraw + Instant. See how to model teams, use cursors and leverage
          permissions.
        </HomeButton>
        <HomeButton
          href="https://github.com/jsventures/stroopwafel"
          title="Stroopwafel (React Native)"
        >
          Multiplayer iOS game built with Expo + Instant. See how you can use
          Instant to build real-time games.
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

function Nav({
  apps,
  hasInvites,
  nav,
  appId,
  tab,
  availableTabs,
}: {
  apps: InstantApp[];
  hasInvites: boolean;
  nav: (p: { s: string; t?: string; app?: string }) => void;
  appId: string;
  tab: TabId;
  availableTabs: TabBarTab[];
}) {
  const router = useRouter();
  const currentApp = apps.find((a) => a.id === appId);
  return (
    <div className="flex flex-col gap-2 border-b border-gray-300 md:w-40 md:gap-0 md:border-b-0 md:border-r bg-gray-50">
      <div className="flex flex-row justify-between gap-2 p-2 md:flex-col md:justify-start bg-gray-50">
        <Select
          className="w-0 basis-[35%] md:w-full md:basis-full truncate text-sm"
          options={apps.map((a) => ({ label: a.title, value: a.id }))}
          disabled={apps.length === 0}
          value={appId}
          onChange={(app) => {
            if (!app) {
              return;
            }

            nav({ s: 'main', app: app.value, t: tab });
          }}
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
      <div className="hidden md:visible md:static flex-row overflow-auto md:flex md:flex-col bg-gray-50 h-full">
        <ToggleCollection
          className="gap-0 text-sm"
          buttonClassName="rounded-none py-2"
          onChange={(t) => nav({ s: 'main', app: appId, t: t.id })}
          selectedId={tab}
          items={availableTabs.map((t) => ({
            ...t,
            label: (
              <div className="flex gap-2">
                <span>{t.label}</span>
              </div>
            ),
          }))}
        />
      </div>
      <div className="p-2 border-t bg-gray-50">
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
  db,
}: {
  dashResponse: APIResponse<DashResponse>;
  app: InstantApp;
  onDelete: () => void;
  nav: (p: { s: string; t?: string; app?: string }) => void;
  db: InstantReactWebDatabase<any>;
}) {
  const token = useContext(TokenContext);
  const [deleteAppOk, updateDeleteAppOk] = useState(false);
  const [clearAppOk, updateClearAppOk] = useState(false);
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
                disabled={!deleteAppOk}
                variant="destructive"
                onClick={async () => {
                  await jsonFetch(`${config.apiURI}/dash/apps/${app.id}`, {
                    method: 'DELETE',
                    headers: {
                      authorization: `Bearer ${token}`,
                      'content-type': 'application/json',
                    },
                  });

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

function Loading() {
  return (
    <div className="animate-slow-pulse flex w-full flex-1 flex-col bg-gray-300"></div>
  );
}

function ErrorMessage({ message }: { message: string }) {
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

function caComp(a: { created_at: string }, b: { created_at: string }) {
  if (a.created_at < b.created_at) {
    return 1;
  }

  if (a.created_at > b.created_at) {
    return -1;
  }
  return 0;
}

/**
 * (XXX)
 * We could type the result of our fetches, and write a better error
 */
function errMessage(e: Error) {
  return e.message || 'An error occurred.';
}

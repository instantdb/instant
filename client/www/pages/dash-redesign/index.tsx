import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { DashDataProvider } from './_views/_shared';
import { LoginView } from './_views/Login';
import { EnterCodeView } from './_views/EnterCode';
import {
  OnboardingStage,
  ONBOARDING_STAGES,
  OnboardingView,
} from './_views/Onboarding';
import { HomeView } from './_views/Home';
import {
  ExplorerSubState,
  EXPLORER_SUB_STATES,
  ExplorerView,
} from './_views/Explorer';
import { SchemaView } from './_views/Schema';
import { PermsView } from './_views/Perms';
import { AuthSubState, AUTH_SUB_STATES, AuthView } from './_views/Auth';
import { QueryInspectorView } from './_views/QueryInspector';
import {
  WebhooksSubState,
  WEBHOOKS_SUB_STATES,
  WebhooksView,
} from './_views/Webhooks';
import {
  UserSettingsSubState,
  USER_SETTINGS_SUB_STATES,
  UserSettingsView,
} from './_views/UserSettings';
import { OrgSubState, ORG_SUB_STATES, OrgView } from './_views/Org';
import { AdminSubState, ADMIN_SUB_STATES, AdminView } from './_views/Admin';
import {
  AdminRamsSubState,
  ADMIN_RAMS_SUB_STATES,
  AdminRamsView,
} from './_views/AdminRams';
import { BillingView } from './_views/Billing';
import {
  OAuthAppsSubState,
  OAUTH_APPS_SUB_STATES,
  OAuthAppsView,
} from './_views/OAuthApps';
import { SandboxView } from './_views/Sandbox';

type ViewKey =
  | 'login'
  | 'enter-code'
  | 'onboarding'
  | 'home'
  | 'explorer'
  | 'schema'
  | 'perms'
  | 'auth'
  | 'repl'
  | 'webhooks'
  | 'sandbox'
  | 'user-settings'
  | 'org'
  | 'admin'
  | 'admin-rams'
  | 'billing'
  | 'oauth-apps';

type NavItem = {
  view: ViewKey;
  label: string;
  stages?: { key: string; label: string }[];
};

const NAV: NavItem[] = [
  { view: 'login', label: 'Login' },
  { view: 'enter-code', label: 'Enter your code' },
  { view: 'onboarding', label: 'Onboarding', stages: ONBOARDING_STAGES },
  { view: 'home', label: 'Home' },
  { view: 'explorer', label: 'Explorer', stages: EXPLORER_SUB_STATES },
  { view: 'schema', label: 'Schema' },
  { view: 'perms', label: 'Permissions' },
  { view: 'auth', label: 'Auth', stages: AUTH_SUB_STATES },
  { view: 'repl', label: 'Query Inspector' },
  { view: 'webhooks', label: 'Webhooks', stages: WEBHOOKS_SUB_STATES },
  { view: 'sandbox', label: 'Sandbox' },
  {
    view: 'user-settings',
    label: 'User Settings',
    stages: USER_SETTINGS_SUB_STATES,
  },
  { view: 'org', label: 'Org', stages: ORG_SUB_STATES },
  { view: 'admin', label: 'Admin', stages: ADMIN_SUB_STATES },
  {
    view: 'admin-rams',
    label: 'Admin (Rams)',
    stages: ADMIN_RAMS_SUB_STATES,
  },
  { view: 'billing', label: 'Billing' },
  {
    view: 'oauth-apps',
    label: 'OAuth Apps',
    stages: OAUTH_APPS_SUB_STATES,
  },
];

type FlatItem =
  | {
      kind: 'view';
      view: Exclude<
        ViewKey,
        | 'onboarding'
        | 'explorer'
        | 'auth'
        | 'webhooks'
        | 'user-settings'
        | 'org'
        | 'oauth-apps'
        | 'admin'
        | 'admin-rams'
      >;
    }
  | { kind: 'stage'; view: 'onboarding'; stage: OnboardingStage }
  | { kind: 'stage'; view: 'explorer'; stage: ExplorerSubState }
  | { kind: 'stage'; view: 'auth'; stage: AuthSubState }
  | { kind: 'stage'; view: 'webhooks'; stage: WebhooksSubState }
  | { kind: 'stage'; view: 'user-settings'; stage: UserSettingsSubState }
  | { kind: 'stage'; view: 'org'; stage: OrgSubState }
  | { kind: 'stage'; view: 'oauth-apps'; stage: OAuthAppsSubState }
  | { kind: 'stage'; view: 'admin'; stage: AdminSubState }
  | { kind: 'stage'; view: 'admin-rams'; stage: AdminRamsSubState };

const FLAT_NAV: FlatItem[] = [
  { kind: 'view', view: 'login' },
  { kind: 'view', view: 'enter-code' },
  ...ONBOARDING_STAGES.map(
    (s): FlatItem => ({ kind: 'stage', view: 'onboarding', stage: s.key }),
  ),
  { kind: 'view', view: 'home' },
  ...EXPLORER_SUB_STATES.map(
    (s): FlatItem => ({ kind: 'stage', view: 'explorer', stage: s.key }),
  ),
  { kind: 'view', view: 'schema' },
  { kind: 'view', view: 'perms' },
  ...AUTH_SUB_STATES.map(
    (s): FlatItem => ({ kind: 'stage', view: 'auth', stage: s.key }),
  ),
  { kind: 'view', view: 'repl' },
  ...WEBHOOKS_SUB_STATES.map(
    (s): FlatItem => ({ kind: 'stage', view: 'webhooks', stage: s.key }),
  ),
  { kind: 'view', view: 'sandbox' },
  ...USER_SETTINGS_SUB_STATES.map(
    (s): FlatItem => ({
      kind: 'stage',
      view: 'user-settings',
      stage: s.key,
    }),
  ),
  ...ORG_SUB_STATES.map(
    (s): FlatItem => ({ kind: 'stage', view: 'org', stage: s.key }),
  ),
  ...ADMIN_SUB_STATES.map(
    (s): FlatItem => ({ kind: 'stage', view: 'admin', stage: s.key }),
  ),
  ...ADMIN_RAMS_SUB_STATES.map(
    (s): FlatItem => ({ kind: 'stage', view: 'admin-rams', stage: s.key }),
  ),
  { kind: 'view', view: 'billing' },
  ...OAUTH_APPS_SUB_STATES.map(
    (s): FlatItem => ({ kind: 'stage', view: 'oauth-apps', stage: s.key }),
  ),
];

const SIDEBAR_WIDTH = 'w-60';

function ViewerSidebar({
  view,
  onboardingStage,
  explorerSub,
  authSub,
  webhooksSub,
  userSettingsSub,
  orgSub,
  oauthAppsSub,
  adminSub,
  adminRamsSub,
  onSelectView,
  onSelectStage,
  buttonRefs,
}: {
  view: ViewKey;
  onboardingStage: OnboardingStage;
  explorerSub: ExplorerSubState;
  authSub: AuthSubState;
  webhooksSub: WebhooksSubState;
  userSettingsSub: UserSettingsSubState;
  orgSub: OrgSubState;
  oauthAppsSub: OAuthAppsSubState;
  adminSub: AdminSubState;
  adminRamsSub: AdminRamsSubState;
  onSelectView: (v: ViewKey) => void;
  onSelectStage: (view: ViewKey, stageKey: string) => void;
  buttonRefs: React.MutableRefObject<Map<string, HTMLButtonElement | null>>;
}) {
  const isActiveStage = (itemView: ViewKey, key: string): boolean => {
    if (view !== itemView) return false;
    if (itemView === 'onboarding') return onboardingStage === key;
    if (itemView === 'explorer') return explorerSub === key;
    if (itemView === 'auth') return authSub === key;
    if (itemView === 'webhooks') return webhooksSub === key;
    if (itemView === 'user-settings') return userSettingsSub === key;
    if (itemView === 'org') return orgSub === key;
    if (itemView === 'oauth-apps') return oauthAppsSub === key;
    if (itemView === 'admin') return adminSub === key;
    if (itemView === 'admin-rams') return adminRamsSub === key;
    return false;
  };

  return (
    <aside
      className={`sticky top-0 h-screen ${SIDEBAR_WIDTH} shrink-0 overflow-y-auto border-r border-gray-200 bg-[#fbfaf8] dark:border-neutral-800 dark:bg-neutral-950`}
    >
      <div className="px-3 py-3 text-[11px] font-semibold tracking-wide text-gray-500 uppercase dark:text-neutral-500">
        Dash redesign
      </div>
      <nav className="flex flex-col gap-0.5 px-2 pb-4 text-sm">
        {NAV.map((item) => {
          const isActiveView = view === item.view;
          return (
            <Fragment key={item.view}>
              <button
                type="button"
                ref={(el) => {
                  buttonRefs.current.set(`view:${item.view}`, el);
                }}
                onClick={() => onSelectView(item.view)}
                className={`flex w-full items-center rounded-md px-3 py-2 text-left transition-colors ${
                  isActiveView
                    ? 'bg-white font-semibold text-gray-950 shadow-xs dark:bg-neutral-900 dark:text-white'
                    : 'text-gray-600 hover:bg-white/70 hover:text-gray-950 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
              {item.stages?.map((s) => {
                const active = isActiveStage(item.view, s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    ref={(el) => {
                      buttonRefs.current.set(`stage:${item.view}:${s.key}`, el);
                    }}
                    onClick={() => onSelectStage(item.view, s.key)}
                    className={`flex w-full items-center rounded-md py-1.5 pr-3 pl-7 text-left text-xs transition-colors ${
                      active
                        ? 'bg-white font-semibold text-gray-950 shadow-xs dark:bg-neutral-900 dark:text-white'
                        : 'text-gray-500 hover:bg-white/70 hover:text-gray-900 dark:text-neutral-500 dark:hover:bg-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="mr-2 text-gray-400 dark:text-neutral-600">
                      ·
                    </span>
                    {s.label}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </nav>
    </aside>
  );
}

function flatIndex(
  view: ViewKey,
  onboardingStage: OnboardingStage,
  explorerSub: ExplorerSubState,
  authSub: AuthSubState,
  webhooksSub: WebhooksSubState,
  userSettingsSub: UserSettingsSubState,
  orgSub: OrgSubState,
  oauthAppsSub: OAuthAppsSubState,
  adminSub: AdminSubState,
  adminRamsSub: AdminRamsSubState,
): number {
  if (view === 'onboarding') {
    return FLAT_NAV.findIndex(
      (i) =>
        i.kind === 'stage' &&
        i.view === 'onboarding' &&
        i.stage === onboardingStage,
    );
  }
  if (view === 'explorer') {
    return FLAT_NAV.findIndex(
      (i) =>
        i.kind === 'stage' && i.view === 'explorer' && i.stage === explorerSub,
    );
  }
  if (view === 'auth') {
    return FLAT_NAV.findIndex(
      (i) => i.kind === 'stage' && i.view === 'auth' && i.stage === authSub,
    );
  }
  if (view === 'webhooks') {
    return FLAT_NAV.findIndex(
      (i) =>
        i.kind === 'stage' && i.view === 'webhooks' && i.stage === webhooksSub,
    );
  }
  if (view === 'user-settings') {
    return FLAT_NAV.findIndex(
      (i) =>
        i.kind === 'stage' &&
        i.view === 'user-settings' &&
        i.stage === userSettingsSub,
    );
  }
  if (view === 'org') {
    return FLAT_NAV.findIndex(
      (i) => i.kind === 'stage' && i.view === 'org' && i.stage === orgSub,
    );
  }
  if (view === 'oauth-apps') {
    return FLAT_NAV.findIndex(
      (i) =>
        i.kind === 'stage' &&
        i.view === 'oauth-apps' &&
        i.stage === oauthAppsSub,
    );
  }
  if (view === 'admin') {
    return FLAT_NAV.findIndex(
      (i) => i.kind === 'stage' && i.view === 'admin' && i.stage === adminSub,
    );
  }
  if (view === 'admin-rams') {
    return FLAT_NAV.findIndex(
      (i) =>
        i.kind === 'stage' &&
        i.view === 'admin-rams' &&
        i.stage === adminRamsSub,
    );
  }
  return FLAT_NAV.findIndex((i) => i.kind === 'view' && i.view === view);
}

export default function DashRedesignViewer() {
  const [view, setView] = useState<ViewKey>('login');
  const [onboardingStage, setOnboardingStage] =
    useState<OnboardingStage>('welcome');
  const [explorerSub, setExplorerSub] = useState<ExplorerSubState>('files');
  const [authSub, setAuthSub] = useState<AuthSubState>('clients-overview');
  const [webhooksSub, setWebhooksSub] = useState<WebhooksSubState>('list');
  const [userSettingsSub, setUserSettingsSub] =
    useState<UserSettingsSubState>('tokens');
  const [orgSub, setOrgSub] = useState<OrgSubState>('members');
  const [oauthAppsSub, setOauthAppsSub] = useState<OAuthAppsSubState>('list');
  const [adminSub, setAdminSub] = useState<AdminSubState>('default');
  const [adminRamsSub, setAdminRamsSub] = useState<AdminRamsSubState>('list');

  const buttonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const isFirstRender = useRef(true);

  const activeKey = useMemo(() => {
    switch (view) {
      case 'onboarding':
        return `stage:onboarding:${onboardingStage}`;
      case 'explorer':
        return `stage:explorer:${explorerSub}`;
      case 'auth':
        return `stage:auth:${authSub}`;
      case 'webhooks':
        return `stage:webhooks:${webhooksSub}`;
      case 'user-settings':
        return `stage:user-settings:${userSettingsSub}`;
      case 'org':
        return `stage:org:${orgSub}`;
      case 'oauth-apps':
        return `stage:oauth-apps:${oauthAppsSub}`;
      case 'admin':
        return `stage:admin:${adminSub}`;
      case 'admin-rams':
        return `stage:admin-rams:${adminRamsSub}`;
      default:
        return `view:${view}`;
    }
  }, [
    view,
    onboardingStage,
    explorerSub,
    authSub,
    webhooksSub,
    userSettingsSub,
    orgSub,
    oauthAppsSub,
    adminSub,
    adminRamsSub,
  ]);

  // Park focus on the active sidebar button after a view/stage change.
  // Double rAF so we land after any dialog's deferred autofocus (HeadlessUI etc.).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        buttonRefs.current.get(activeKey)?.focus();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [activeKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const isEditable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable;
        // If we're inside a dialog, the user is previewing a state — let
        // arrow keys keep navigating. Radix's focus trap will refocus the
        // new dialog's first field on the next render.
        const inDialog = !!target.closest('[role="dialog"]');
        if (isEditable && !inDialog) return;
      }
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const idx = flatIndex(
        view,
        onboardingStage,
        explorerSub,
        authSub,
        webhooksSub,
        userSettingsSub,
        orgSub,
        oauthAppsSub,
        adminSub,
        adminRamsSub,
      );
      const next = FLAT_NAV[(idx + delta + FLAT_NAV.length) % FLAT_NAV.length];
      setView(next.view);
      if (next.kind === 'stage' && next.view === 'onboarding') {
        setOnboardingStage(next.stage);
      }
      if (next.kind === 'stage' && next.view === 'explorer') {
        setExplorerSub(next.stage);
      }
      if (next.kind === 'stage' && next.view === 'auth') {
        setAuthSub(next.stage);
      }
      if (next.kind === 'stage' && next.view === 'webhooks') {
        setWebhooksSub(next.stage);
      }
      if (next.kind === 'stage' && next.view === 'user-settings') {
        setUserSettingsSub(next.stage);
      }
      if (next.kind === 'stage' && next.view === 'org') {
        setOrgSub(next.stage);
      }
      if (next.kind === 'stage' && next.view === 'oauth-apps') {
        setOauthAppsSub(next.stage);
      }
      if (next.kind === 'stage' && next.view === 'admin') {
        setAdminSub(next.stage);
      }
      if (next.kind === 'stage' && next.view === 'admin-rams') {
        setAdminRamsSub(next.stage);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    view,
    onboardingStage,
    explorerSub,
    authSub,
    webhooksSub,
    userSettingsSub,
    orgSub,
    oauthAppsSub,
    adminSub,
    adminRamsSub,
  ]);

  const onSelectStage = (targetView: ViewKey, stageKey: string) => {
    setView(targetView);
    if (targetView === 'onboarding') {
      setOnboardingStage(stageKey as OnboardingStage);
    }
    if (targetView === 'explorer') {
      setExplorerSub(stageKey as ExplorerSubState);
    }
    if (targetView === 'auth') {
      setAuthSub(stageKey as AuthSubState);
    }
    if (targetView === 'webhooks') {
      setWebhooksSub(stageKey as WebhooksSubState);
    }
    if (targetView === 'user-settings') {
      setUserSettingsSub(stageKey as UserSettingsSubState);
    }
    if (targetView === 'org') {
      setOrgSub(stageKey as OrgSubState);
    }
    if (targetView === 'oauth-apps') {
      setOauthAppsSub(stageKey as OAuthAppsSubState);
    }
    if (targetView === 'admin') {
      setAdminSub(stageKey as AdminSubState);
    }
    if (targetView === 'admin-rams') {
      setAdminRamsSub(stageKey as AdminRamsSubState);
    }
  };

  return (
    <>
      <Head>
        <title>Dash redesign viewer</title>
      </Head>
      <div className="flex min-h-screen bg-[#fbfaf8] dark:bg-neutral-950">
        <ViewerSidebar
          view={view}
          onboardingStage={onboardingStage}
          explorerSub={explorerSub}
          authSub={authSub}
          webhooksSub={webhooksSub}
          userSettingsSub={userSettingsSub}
          orgSub={orgSub}
          oauthAppsSub={oauthAppsSub}
          adminSub={adminSub}
          adminRamsSub={adminRamsSub}
          onSelectView={setView}
          onSelectStage={onSelectStage}
          buttonRefs={buttonRefs}
        />
        <main className="relative min-w-0 flex-1">
          {view === 'login' && <LoginView />}
          {view === 'enter-code' && <EnterCodeView />}
          {view === 'onboarding' && <OnboardingView stage={onboardingStage} />}
          {view === 'home' && (
            <DashDataProvider>
              <HomeView />
            </DashDataProvider>
          )}
          {view === 'explorer' && <ExplorerView sub={explorerSub} />}
          {view === 'schema' && (
            <DashDataProvider>
              <SchemaView />
            </DashDataProvider>
          )}
          {view === 'perms' && (
            <DashDataProvider>
              <PermsView />
            </DashDataProvider>
          )}
          {view === 'auth' && (
            <DashDataProvider>
              <AuthView sub={authSub} />
            </DashDataProvider>
          )}
          {view === 'repl' && <QueryInspectorView />}
          {view === 'webhooks' && (
            <DashDataProvider>
              <WebhooksView sub={webhooksSub} />
            </DashDataProvider>
          )}
          {view === 'sandbox' && <SandboxView />}
          {view === 'user-settings' && (
            <UserSettingsView sub={userSettingsSub} />
          )}
          {view === 'org' && <OrgView sub={orgSub} />}
          {view === 'admin' && <AdminView sub={adminSub} />}
          {view === 'admin-rams' && <AdminRamsView sub={adminRamsSub} />}
          {view === 'billing' && <BillingView />}
          {view === 'oauth-apps' && <OAuthAppsView sub={oauthAppsSub} />}
        </main>
      </div>
    </>
  );
}

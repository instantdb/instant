import { useState } from 'react';
import {
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  BeakerIcon,
  BoltIcon,
  BuildingOffice2Icon,
  CodeBracketIcon,
  CreditCardIcon,
  CubeIcon,
  FunnelIcon,
  HomeIcon,
  IdentificationIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { ChevronDownIcon, MoonIcon, PlusIcon } from '@heroicons/react/24/solid';
import {
  Button,
  FullscreenLoading,
  LogoIcon,
  SmallCopyable,
} from '@/components/ui';
import { useAuthToken } from '@/lib/auth';
import { TokenContext } from '@/lib/contexts';
import {
  DashFetchProvider,
  useFetchedDash,
} from '@/components/dash/MainDashLayout';
import { InstantApp } from '@/lib/types';
import { EphemeralApp, useEphemeralApp } from './_ephemeral';

export { useFetchedDash };

export function ephemeralAppToInstantApp(e: EphemeralApp): InstantApp {
  return {
    id: e.id,
    title: 'Dash Redesign Sandbox',
    admin_token: e.adminToken,
    pro: false,
    created_at: new Date().toISOString(),
    rules: null,
    rules_version: null,
    user_app_role: 'owner',
    members: null,
    invites: null,
    magic_code_email_template: null,
    magic_code_expiry_minutes: null,
    org: null,
  } as InstantApp;
}

export function useEphemeralInstantApp():
  | { status: 'loading' }
  | { status: 'error'; error: Error; reset: () => void }
  | { status: 'ready'; app: InstantApp; reset: () => void } {
  const e = useEphemeralApp();
  if (e.status === 'loading') return { status: 'loading' };
  if (e.status === 'error') {
    return { status: 'error', error: e.error, reset: e.reset };
  }
  return {
    status: 'ready',
    app: ephemeralAppToInstantApp(e.app),
    reset: e.reset,
  };
}

export function EphemeralLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center text-sm text-gray-600 dark:text-neutral-400">
      Provisioning sandbox app…
    </div>
  );
}

export function EphemeralError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-4 text-center text-sm">
      <div className="text-red-700 dark:text-red-400">
        Failed to provision sandbox: {error.message}
      </div>
      <button
        type="button"
        className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        onClick={reset}
      >
        Try again
      </button>
    </div>
  );
}

export function toDirectoryName(title: string): string {
  const dirName = title
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return dirName || 'instant-app';
}

export function DashDataProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthToken();

  if (!token) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-center">
        <div className="max-w-sm">
          <p className="mb-4 text-sm text-gray-700 dark:text-neutral-300">
            You need to be logged in to view this redesign page.
          </p>
          <a
            href="/dash"
            className="text-sm text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
          >
            Go to /dash to log in
          </a>
        </div>
      </div>
    );
  }

  return (
    <TokenContext.Provider value={token}>
      <DashFetchProvider
        loading={<FullscreenLoading />}
        error={(e) => (
          <div className="p-4 text-sm text-red-700">Error: {e.message}</div>
        )}
      >
        {children}
      </DashFetchProvider>
    </TokenContext.Provider>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4 dark:bg-neutral-900">
      <div className="max-w-sm">
        <span className="inline-flex items-center space-x-2">
          <LogoIcon />
          <span className="font-mono text-sm lowercase">Instant</span>
        </span>
        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

export function BackToAppsLink() {
  return (
    <a
      className="ml-2 flex items-center gap-2 rounded-xs p-1 px-2 text-sm opacity-70 transition-colors hover:bg-gray-200/50 dark:hover:bg-neutral-700/60"
      href="#"
    >
      <ArrowUturnLeftIcon width={12} />
      Back to Apps
    </a>
  );
}

export type TopBarAccount =
  | { kind: 'user'; email: string }
  | { kind: 'org'; title: string };

export function MockTopBar({
  appTitle,
  account = { kind: 'user', email: 'sto.pa@instantdb.com' },
  leftExtra,
}: {
  appTitle?: string;
  account?: TopBarAccount;
  leftExtra?: React.ReactNode;
}) {
  const accountIcon =
    account.kind === 'user' ? (
      <UserIcon opacity="40%" width={16} />
    ) : (
      <BuildingOffice2Icon opacity="40%" width={16} />
    );
  const accountLabel = account.kind === 'user' ? account.email : account.title;
  return (
    <div className="relative flex flex-col gap-2 border-b border-b-gray-300 px-2 py-2 md:px-4 dark:border-b-neutral-700 dark:bg-neutral-800 dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-row items-center gap-2">
          <div className="flex items-center justify-between gap-9 rounded-xs border border-gray-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-700/40">
            <div className="flex items-center gap-2">
              {accountIcon}
              <div>{accountLabel}</div>
            </div>
            <ChevronDownIcon width={15} />
          </div>
          {appTitle && (
            <div className="flex items-center justify-between gap-9 truncate rounded-xs border border-gray-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-700/40">
              <div>{appTitle}</div>
              <ChevronDownIcon width={15} />
            </div>
          )}
          {leftExtra}
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <a
            className="flex items-center gap-1 text-sm opacity-50 hover:underline"
            href="#"
          >
            Docs
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
          <button type="button" className="text-gray-500">
            <MoonIcon className="h-4 w-4 opacity-40" />
          </button>
          <Button size="mini" variant="primary">
            <PlusIcon height={14} /> New app
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OnboardingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col dark:bg-neutral-900">
      <MockTopBar />
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}

export type DashTabId =
  | 'home'
  | 'explorer'
  | 'schema'
  | 'perms'
  | 'auth'
  | 'repl'
  | 'sandbox'
  | 'admin'
  | 'billing'
  | 'oauth-apps'
  | 'webhooks';

const DASH_TABS: { id: DashTabId; title: string; icon: React.ReactNode }[] = [
  { id: 'home', title: 'Home', icon: <HomeIcon width={14} /> },
  { id: 'explorer', title: 'Explorer', icon: <FunnelIcon width={14} /> },
  { id: 'schema', title: 'Schema', icon: <CodeBracketIcon width={14} /> },
  { id: 'perms', title: 'Permissions', icon: <LockClosedIcon width={14} /> },
  { id: 'auth', title: 'Auth', icon: <IdentificationIcon width={14} /> },
  {
    id: 'repl',
    title: 'Query Inspector',
    icon: <MagnifyingGlassIcon width={14} />,
  },
  { id: 'webhooks', title: 'Webhooks', icon: <BoltIcon width={14} /> },
  { id: 'sandbox', title: 'Sandbox', icon: <BeakerIcon width={14} /> },
  { id: 'admin', title: 'Admin', icon: <ShieldCheckIcon width={14} /> },
  { id: 'billing', title: 'Billing', icon: <CreditCardIcon width={14} /> },
  { id: 'oauth-apps', title: 'OAuth Apps', icon: <CubeIcon width={14} /> },
];

function LeftNav({ active }: { active: DashTabId }) {
  return (
    <div className="flex flex-col gap-2 border-b border-gray-300 bg-gray-50 md:w-48 md:gap-0 md:border-r md:border-b-0 dark:border-neutral-700/80 dark:bg-neutral-800/40">
      <div className="hidden h-full flex-row overflow-auto bg-gray-50 md:visible md:static md:flex md:flex-col dark:bg-neutral-800/40">
        {DASH_TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              className={`flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-white dark:bg-neutral-800 dark:text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-neutral-800/80'
              }`}
            >
              {t.icon}
              <span>{t.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppHeader({ app }: { app: InstantApp }) {
  const [hideAppId, setHideAppId] = useState(false);
  return (
    <div className="bg-gray-50 dark:bg-neutral-800/90">
      <div className="flex flex-col justify-between border-b border-b-gray-300 px-3 py-2 md:flex-row md:gap-4 dark:border-b-neutral-700">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold md:text-xl">{app.title}</h2>
        </div>
        <SmallCopyable
          size="normal"
          label="Public App ID"
          value={app.id}
          hideValue={hideAppId}
          onChangeHideValue={() => setHideAppId(!hideAppId)}
        />
      </div>
    </div>
  );
}

export function DashShell({
  active,
  app,
  children,
}: {
  active: DashTabId;
  app: InstantApp;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col dark:bg-neutral-900">
      <MockTopBar appTitle={app.title} />
      <AppHeader app={app} />
      <div className="flex w-full grow flex-col overflow-hidden md:flex-row">
        <LeftNav active={active} />
        <div className="flex w-full flex-1 flex-col overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

import { forwardRef, ReactNode, useState } from 'react';
import {
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  BeakerIcon,
  BoltIcon,
  BuildingOffice2Icon,
  CodeBracketIcon,
  CreditCardIcon,
  CubeIcon,
  EyeIcon,
  EyeSlashIcon,
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
  cn,
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

export function DashDataProvider({ children }: { children: ReactNode }) {
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

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#fbfaf8] p-6 dark:bg-neutral-950">
      <div className="w-full max-w-[440px]">
        <span className="mb-6 inline-flex items-center gap-2.5">
          <LogoIcon size="normal" className="h-7 w-7" />
          <span className="font-mono text-[20px] font-bold text-gray-950 lowercase dark:text-white">
            instant
          </span>
        </span>
        <div className="flex flex-col gap-6">{children}</div>
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
  leftExtra?: ReactNode;
}) {
  const accountIcon =
    account.kind === 'user' ? (
      <UserIcon opacity="40%" width={16} />
    ) : (
      <BuildingOffice2Icon opacity="40%" width={16} />
    );
  const accountLabel = account.kind === 'user' ? account.email : account.title;
  return (
    <div className="relative flex flex-col gap-2 border-b border-gray-200 bg-white px-3 py-2 md:px-5 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-row items-center gap-2">
          <div className="flex min-h-10 min-w-[220px] items-center justify-between gap-4 rounded-md border border-gray-300 bg-white px-3.5 text-sm shadow-xs dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center gap-2">
              {accountIcon}
              <div>{accountLabel}</div>
            </div>
            <ChevronDownIcon width={15} />
          </div>
          {appTitle && (
            <div className="flex min-h-10 min-w-[180px] items-center justify-between gap-4 truncate rounded-md border border-gray-300 bg-white px-3.5 text-sm shadow-xs dark:border-neutral-700 dark:bg-neutral-900">
              <div>{appTitle}</div>
              <ChevronDownIcon width={15} />
            </div>
          )}
          {leftExtra}
        </div>
        <div className="flex items-center gap-3 md:gap-4">
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

export function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col bg-[#fbfaf8] dark:bg-neutral-950">
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

const DASH_TABS: { id: DashTabId; title: string; icon: ReactNode }[] = [
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
    <div className="flex flex-col gap-2 border-b border-gray-200 bg-[#fbfaf8] md:w-52 md:gap-0 md:border-r md:border-b-0 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="hidden h-full flex-row overflow-auto p-2 md:visible md:static md:flex md:flex-col">
        {DASH_TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-white font-semibold text-gray-950 shadow-xs dark:bg-neutral-900 dark:text-white'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-950 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white'
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
    <div className="bg-white dark:bg-neutral-950">
      <div className="flex flex-col justify-between border-b border-gray-200 px-4 py-3 md:flex-row md:items-center md:gap-4 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold tracking-normal text-gray-950 dark:text-white">
            {app.title}
          </h2>
        </div>
        <SmallCopyable
          size="normal"
          label="App ID"
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
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col bg-[#fbfaf8] text-gray-950 dark:bg-neutral-950 dark:text-white">
      <MockTopBar appTitle={app.title} />
      <AppHeader app={app} />
      <div className="flex w-full grow flex-col overflow-hidden md:flex-row">
        <LeftNav active={active} />
        <div className="flex w-full flex-1 flex-col overflow-auto bg-[#fbfaf8] dark:bg-neutral-950">
          {children}
        </div>
      </div>
    </div>
  );
}

export function DashPage({
  children,
  className,
  size = 'default',
}: {
  children: ReactNode;
  className?: string;
  size?: 'narrow' | 'default' | 'wide' | 'full';
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-1 flex-col gap-6 px-5 py-5 md:px-7 md:py-6',
        size === 'narrow' && 'max-w-2xl',
        size === 'default' && 'max-w-4xl',
        size === 'wide' && 'max-w-6xl',
        size === 'full' && 'max-w-none',
        className,
      )}
    >
      {children}
    </div>
  );
}

export const DashPanel = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string }
>(({ children, className }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900',
        className,
      )}
    >
      {children}
    </div>
  );
});
DashPanel.displayName = 'DashPanel';

export function DashEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-28 flex-col items-center justify-center rounded-md border border-dashed border-gray-300 bg-[#fbfaf8] px-4 py-6 text-center dark:border-neutral-700 dark:bg-neutral-950',
        className,
      )}
    >
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        {title}
      </div>
      {description ? (
        <div className="mt-1 max-w-sm text-sm text-gray-500 dark:text-neutral-400">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function DashNotice({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'warning' | 'danger';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm leading-6',
        tone === 'neutral' &&
          'border-gray-200 bg-[#fbfaf8] text-gray-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300',
        tone === 'warning' &&
          'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200',
        tone === 'danger' &&
          'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200',
        className,
      )}
    >
      {children}
    </div>
  );
}

function maskSecret(value: string) {
  return value.replace(/[^_\-\s]/g, '*');
}

export function DashSecretField({
  label,
  value,
  defaultHidden = true,
  description,
  className,
}: {
  label: ReactNode;
  value: string;
  defaultHidden?: boolean;
  description?: ReactNode;
  className?: string;
}) {
  const [hidden, setHidden] = useState(defaultHidden);
  const [copied, setCopied] = useState(false);
  const displayValue = hidden ? maskSecret(value) : value;

  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-md border border-gray-200 bg-gray-950 shadow-xs dark:border-neutral-700',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-gray-300">
            {label}
          </div>
          {description ? (
            <div className="mt-0.5 truncate text-xs text-gray-500">
              {description}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            onClick={() => setHidden((v) => !v)}
          >
            {hidden ? (
              <EyeIcon className="h-4 w-4" />
            ) : (
              <EyeSlashIcon className="h-4 w-4" />
            )}
            {hidden ? 'Show' : 'Hide'}
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
            onClick={() => {
              window.navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="max-h-44 min-w-0 overflow-auto px-3 py-3 font-mono text-sm leading-6 whitespace-pre-wrap text-gray-100">
        {displayValue}
      </pre>
    </div>
  );
}

export function DashPanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-lg font-semibold tracking-normal text-gray-950 dark:text-white">
          {title}
        </div>
        {description ? (
          <div className="mt-1 text-sm leading-6 text-gray-600 dark:text-neutral-400">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function DashRow({
  label,
  value,
  action,
}: {
  label: ReactNode;
  value?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-gray-100 py-3 first:border-t-0 dark:border-neutral-800">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-gray-950 dark:text-white">
          {label}
        </div>
        {value ? (
          <div className="mt-0.5 truncate text-sm text-gray-500 dark:text-neutral-400">
            {value}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

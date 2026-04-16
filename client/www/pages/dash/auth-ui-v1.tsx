import { useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import {
  ChevronDownIcon as ChevronDownSolidIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import {
  ArrowTopRightOnSquareIcon,
  BeakerIcon,
  CheckCircleIcon,
  CodeBracketIcon,
  CreditCardIcon,
  CubeIcon,
  EnvelopeIcon,
  FunnelIcon,
  GlobeAltIcon,
  HomeIcon,
  IdentificationIcon,
  KeyIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

import { asClientOnlyPage } from '@/components/clientOnlyPage';
import { TokenContext } from '@/lib/contexts';
import { DarkModeToggle, useDarkMode } from '@/components/dash/DarkModeToggle';
import {
  Button,
  cn,
  Content,
  Label,
  SectionHeading,
  SmallCopyable,
  SubsectionHeading,
  TextArea,
  TextInput,
  ToggleCollection,
} from '@/components/ui';
import {
  AuthorizedOrigin,
  InstantApp,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';

import googleIconSvg from '../../public/img/google_g.svg';
import appleIconSvg from '../../public/img/apple_logo_black.svg';
import githubIconSvg from '../../public/img/github.svg';
import linkedinIconSvg from '../../public/img/linkedin.svg';
import clerkIconSvg from '../../public/img/clerk_logo_black.svg';
import firebaseIconSvg from '../../public/img/firebase_auth.svg';

// ---------------------------------------------------------------------------
// Mock data (lifted from auth-ui.tsx)
// ---------------------------------------------------------------------------

const MOCK_APP: InstantApp = {
  id: 'mock-app-id-0000-0000-000000000000',
  pro: false,
  title: 'instant show hn',
  created_at: '2026-01-01T00:00:00Z',
  admin_token: 'mock-admin-token',
  rules: null,
  rules_version: null,
  user_app_role: 'owner',
  members: null,
  invites: null,
  magic_code_email_template: null,
  magic_code_expiry_minutes: 10,
  org: null,
};

const PROVIDERS: Record<string, OAuthServiceProvider> = {
  google: { id: 'prov-google', provider_name: 'google' },
  apple: { id: 'prov-apple', provider_name: 'apple' },
  github: { id: 'prov-github', provider_name: 'github' },
  linkedin: { id: 'prov-linkedin', provider_name: 'linkedin' },
  clerk: { id: 'prov-clerk', provider_name: 'clerk' },
  firebase: { id: 'prov-firebase', provider_name: 'firebase' },
};

const googleSharedClient: OAuthClient = {
  id: 'c-google-shared',
  client_name: 'google-web',
  client_id: 'shared-dev-client-id',
  provider_id: PROVIDERS.google.id,
  meta: { appType: 'web', useSharedCredentials: true },
};

const googleCustomClient: OAuthClient = {
  id: 'c-google-custom',
  client_name: 'google-web',
  client_id: '123456789-abc.apps.googleusercontent.com',
  provider_id: PROVIDERS.google.id,
  redirect_to: 'https://yoursite.com/oauth/callback',
  meta: { appType: 'web' },
};

const googleIosClient: OAuthClient = {
  id: 'c-google-ios',
  client_name: 'google-ios',
  client_id: 'ios-client-id',
  provider_id: PROVIDERS.google.id,
  meta: { appType: 'ios', skipNonceChecks: true },
};

const appleClient: OAuthClient = {
  id: 'c-apple',
  client_name: 'apple',
  client_id: 'com.example.services',
  provider_id: PROVIDERS.apple.id,
  meta: { teamId: 'TEAM1234', keyId: 'KEY5678' },
};

const githubClient: OAuthClient = {
  id: 'c-github',
  client_name: 'github-web',
  client_id: 'Iv1.abcdef0123456789',
  provider_id: PROVIDERS.github.id,
  redirect_to: 'https://yoursite.com/oauth/callback',
  meta: {},
};

const clerkClient: OAuthClient = {
  id: 'c-clerk',
  client_name: 'clerk',
  client_id: 'clerk-id',
  provider_id: PROVIDERS.clerk.id,
  discovery_endpoint:
    'https://clean-cat-20.clerk.accounts.dev/.well-known/openid-configuration',
  meta: {
    clerkPublishableKey: 'pk_test_Y2xlYW4tY2F0LTIwLmNsZXJrLmFjY291bnRzLmRldiQ',
  },
};

const ORIGINS_FULL: AuthorizedOrigin[] = [
  { id: 'o-web', service: 'generic', params: ['yoursite.com'] },
  { id: 'o-vercel', service: 'vercel', params: ['vercel.app', 'my-project'] },
  { id: 'o-netlify', service: 'netlify', params: ['my-site'] },
  { id: 'o-custom', service: 'custom-scheme', params: ['myapp'] },
];

const ORIGIN_WEBSITE_ONLY: AuthorizedOrigin[] = [
  { id: 'o-web', service: 'generic', params: ['yoursite.com'] },
];

type TestUser = { id: string; email: string; code: string };

const TEST_USERS_FULL: TestUser[] = [
  { id: 't1', email: 'alice@example.com', code: '424242' },
  { id: 't2', email: 'appstore-review@example.com', code: '123456' },
];

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

type ProviderType =
  | 'google'
  | 'apple'
  | 'github'
  | 'linkedin'
  | 'clerk'
  | 'firebase';

const PROVIDER_UI: Record<
  ProviderType,
  { label: string; icon: any; darkInvert?: boolean; docs: string }
> = {
  google: { label: 'Google', icon: googleIconSvg, docs: 'Web, iOS, Android' },
  apple: {
    label: 'Apple',
    icon: appleIconSvg,
    darkInvert: true,
    docs: 'Sign in with Apple',
  },
  github: {
    label: 'GitHub',
    icon: githubIconSvg,
    darkInvert: true,
    docs: 'OAuth app',
  },
  linkedin: { label: 'LinkedIn', icon: linkedinIconSvg, docs: 'OIDC' },
  clerk: {
    label: 'Clerk',
    icon: clerkIconSvg,
    darkInvert: true,
    docs: 'Clerk-hosted auth',
  },
  firebase: {
    label: 'Firebase',
    icon: firebaseIconSvg,
    docs: 'Firebase Auth',
  },
};

const PROVIDER_ORDER: ProviderType[] = [
  'google',
  'apple',
  'github',
  'linkedin',
  'clerk',
  'firebase',
];

function providerNameOf(client: OAuthClient): ProviderType {
  const name = Object.values(PROVIDERS).find(
    (p) => p.id === client.provider_id,
  )?.provider_name;
  return (name as ProviderType) ?? 'google';
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function ProviderIcon({
  provider,
  size = 20,
}: {
  provider: ProviderType;
  size?: number;
}) {
  const cfg = PROVIDER_UI[provider];
  return (
    <Image
      alt={`${cfg.label} icon`}
      src={cfg.icon}
      width={size}
      height={size}
      className={cfg.darkInvert ? 'dark:invert' : ''}
    />
  );
}

function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'blue' | 'green' | 'amber';
}) {
  const tones: Record<string, string> = {
    neutral:
      'bg-gray-100 text-gray-700 dark:bg-neutral-700/60 dark:text-neutral-200',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
    green:
      'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300',
    amber:
      'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function PillButton({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex cursor-pointer items-center gap-2 rounded-sm border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
      {children}
    </div>
  );
}

function CardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-sm border bg-white dark:border-neutral-700 dark:bg-neutral-800/60',
        className,
      )}
    >
      {children}
    </div>
  );
}

function StatusCircle({ isSuccess }: { isSuccess: boolean }) {
  if (isSuccess) {
    return (
      <div className="flex h-3 w-3 items-center justify-center rounded-full bg-green-500">
        <span className="text-[9px] leading-none text-white">✓</span>
      </div>
    );
  }
  return <div className="h-3 w-3 rounded-full bg-red-500"></div>;
}

// ---------------------------------------------------------------------------
// Dash chrome (copied from auth-ui.tsx)
// ---------------------------------------------------------------------------

function DashTopBar() {
  return (
    <div className="flex flex-col gap-2 border-b border-b-gray-300 px-2 py-2 md:px-4 dark:border-b-neutral-700 dark:bg-neutral-800 dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-row items-center gap-2">
          <PillButton>
            <UserIcon className="h-4 w-4" />
            <span>stepan.p@gmail.com</span>
            <ChevronDownSolidIcon className="h-3 w-3 opacity-50" />
          </PillButton>
          <PillButton>
            <span>instant show hn</span>
            <ChevronDownSolidIcon className="h-3 w-3 opacity-50" />
          </PillButton>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
          <span className="flex items-center gap-1 text-sm opacity-50">
            Docs
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </span>
          <DarkModeToggle />
          <Button size="mini" variant="primary">
            <PlusIcon height={14} /> New app
          </Button>
        </div>
      </div>
    </div>
  );
}

function DashAppHeader() {
  return (
    <div className="bg-gray-50 dark:bg-neutral-800/90">
      <div className="flex flex-col justify-between border-b border-b-gray-300 px-3 py-2 md:flex-row md:gap-4 dark:border-b-neutral-700">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold md:text-xl dark:text-white">
            {MOCK_APP.title}
          </h2>
        </div>
        <SmallCopyable
          size="normal"
          label="Public App ID"
          value={MOCK_APP.id}
        />
      </div>
    </div>
  );
}

const SIDEBAR_TABS = [
  { id: 'home', label: 'Home', icon: <HomeIcon className="h-3.5 w-3.5" /> },
  {
    id: 'explorer',
    label: 'Explorer',
    icon: <FunnelIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'schema',
    label: 'Schema',
    icon: <CodeBracketIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'perms',
    label: 'Permissions',
    icon: <LockClosedIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'auth',
    label: 'Auth',
    icon: <IdentificationIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'repl',
    label: 'Query Inspector',
    icon: <MagnifyingGlassIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    icon: <BeakerIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: <ShieldCheckIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: <CreditCardIcon className="h-3.5 w-3.5" />,
  },
  {
    id: 'oauth-apps',
    label: 'OAuth Apps',
    icon: <CubeIcon className="h-3.5 w-3.5" />,
  },
];

function DashSidebar() {
  return (
    <div className="flex flex-col gap-2 border-b border-gray-300 bg-gray-50 md:w-48 md:gap-0 md:border-r md:border-b-0 dark:border-neutral-700/80 dark:bg-neutral-800/40">
      <div className="hidden h-full flex-row overflow-auto bg-gray-50 md:visible md:static md:flex md:flex-col dark:bg-neutral-800/40">
        <ToggleCollection
          className="gap-0 text-sm"
          buttonClassName="rounded-none py-2"
          onChange={() => {}}
          selectedId="auth"
          items={SIDEBAR_TABS.map((t) => ({
            id: t.id,
            label: (
              <div className="flex items-center gap-2">
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </div>
            ),
          }))}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------

type TabId = 'clients' | 'origins' | 'users' | 'email';

const TABS: { id: TabId; label: string; icon: React.ReactNode; hint: string }[] =
  [
    {
      id: 'clients',
      label: 'Clients',
      icon: <KeyIcon className="h-4 w-4" />,
      hint: 'OAuth providers',
    },
    {
      id: 'origins',
      label: 'Redirect origins',
      icon: <GlobeAltIcon className="h-4 w-4" />,
      hint: 'Allowed domains',
    },
    {
      id: 'users',
      label: 'Test users',
      icon: <UserGroupIcon className="h-4 w-4" />,
      hint: 'Static magic codes',
    },
    {
      id: 'email',
      label: 'Email',
      icon: <EnvelopeIcon className="h-4 w-4" />,
      hint: 'Magic code template',
    },
  ];

function TabStrip({
  activeTab,
  onSelect,
  counts,
}: {
  activeTab: TabId;
  onSelect: (t: TabId) => void;
  counts: Record<TabId, number | null>;
}) {
  return (
    <div className="flex items-end gap-0 overflow-x-auto border-b border-gray-200 px-6 dark:border-neutral-700/80">
      {TABS.map((t) => {
        const active = t.id === activeTab;
        const count = counts[t.id];
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              'group flex cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors',
              active
                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-300'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200',
            )}
          >
            <span className={active ? '' : 'opacity-80'}>{t.icon}</span>
            <span className="font-medium">{t.label}</span>
            {count !== null ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono text-[10px]',
                  active
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                    : 'bg-gray-100 text-gray-500 dark:bg-neutral-700/60 dark:text-neutral-300',
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page heading / tab header
// ---------------------------------------------------------------------------

function TabHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
      <div className="max-w-2xl">
        <SectionHeading>{title}</SectionHeading>
        <Content className="mt-1 text-sm text-gray-500 dark:text-neutral-400">
          {description}
        </Content>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clients tab
// ---------------------------------------------------------------------------

function appTypeBadge(client: OAuthClient): React.ReactNode {
  const appType = client.meta?.appType as string | undefined;
  if (appType === 'web') return <Badge tone="blue">Web</Badge>;
  if (appType === 'ios') return <Badge tone="neutral">iOS</Badge>;
  if (appType === 'android') return <Badge tone="neutral">Android</Badge>;
  if (appType === 'button-for-web')
    return <Badge tone="blue">Button · Web</Badge>;
  return null;
}

function ClientCard({ client }: { client: OAuthClient }) {
  const provider = providerNameOf(client);
  const cfg = PROVIDER_UI[provider];
  const hasRedirect = !!client.redirect_to;
  const usesShared = !!client.meta?.useSharedCredentials;
  return (
    <CardShell className="hover:border-gray-300 dark:hover:border-neutral-600">
      <div className="flex items-start justify-between gap-3 border-b p-4 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-sm border bg-gray-50 dark:border-neutral-700 dark:bg-neutral-700/40">
            <ProviderIcon provider={provider} size={18} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold dark:text-white">
                {client.client_name}
              </span>
              {appTypeBadge(client)}
              {usesShared ? <Badge tone="amber">Shared dev</Badge> : null}
            </div>
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              {cfg.label} · {cfg.docs}
            </span>
          </div>
        </div>
        <Button size="mini" variant="secondary">
          <PencilSquareIcon className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>
      <div className="flex flex-col gap-2 p-4 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">
            Client ID
          </span>
          <code className="truncate rounded-sm bg-gray-50 px-2 py-1 font-mono text-xs dark:bg-neutral-700/50 dark:text-neutral-200">
            {client.client_id}
          </code>
        </div>
        {hasRedirect ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">
              Redirect URL
            </span>
            <code className="truncate rounded-sm bg-gray-50 px-2 py-1 font-mono text-xs dark:bg-neutral-700/50 dark:text-neutral-200">
              {client.redirect_to}
            </code>
          </div>
        ) : null}
        {provider === 'apple' && client.meta?.teamId ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">
                Team ID
              </span>
              <code className="truncate rounded-sm bg-gray-50 px-2 py-1 font-mono text-xs dark:bg-neutral-700/50 dark:text-neutral-200">
                {client.meta.teamId}
              </code>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">
                Key ID
              </span>
              <code className="truncate rounded-sm bg-gray-50 px-2 py-1 font-mono text-xs dark:bg-neutral-700/50 dark:text-neutral-200">
                {client.meta.keyId}
              </code>
            </div>
          </div>
        ) : null}
        {provider === 'clerk' && client.meta?.clerkPublishableKey ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">
              Publishable key
            </span>
            <code className="truncate rounded-sm bg-gray-50 px-2 py-1 font-mono text-xs dark:bg-neutral-700/50 dark:text-neutral-200">
              {client.meta.clerkPublishableKey}
            </code>
          </div>
        ) : null}
      </div>
    </CardShell>
  );
}

function AddClientCard() {
  return (
    <button className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border border-dashed p-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/30 dark:border-neutral-700 dark:hover:border-blue-500 dark:hover:bg-blue-500/5">
      <div className="flex -space-x-2">
        {PROVIDER_ORDER.slice(0, 4).map((p) => {
          const cfg = PROVIDER_UI[p];
          return (
            <div
              key={p}
              className="flex h-8 w-8 items-center justify-center rounded-full border bg-white shadow-sm dark:border-neutral-600 dark:bg-neutral-800"
            >
              <Image
                alt={cfg.label}
                src={cfg.icon}
                width={16}
                height={16}
                className={cfg.darkInvert ? 'dark:invert' : ''}
              />
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold dark:text-white">
          Add an auth client
        </span>
        <span className="text-xs text-gray-500 dark:text-neutral-400">
          Connect Google, Apple, GitHub, Clerk, Firebase, and more
        </span>
      </div>
    </button>
  );
}

function ProviderPickerCard() {
  return (
    <CardShell className="md:col-span-2 xl:col-span-3">
      <div className="flex items-center justify-between border-b p-4 dark:border-neutral-700">
        <SubsectionHeading>Select an auth provider</SubsectionHeading>
        <Button size="mini" variant="secondary">
          Cancel
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
        {PROVIDER_ORDER.map((p) => {
          const cfg = PROVIDER_UI[p];
          return (
            <button
              key={p}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-sm border p-4 transition-colors hover:border-blue-400 hover:bg-blue-50/30 dark:border-neutral-700 dark:hover:border-blue-500 dark:hover:bg-blue-500/5"
            >
              <Image
                alt={`${cfg.label} icon`}
                src={cfg.icon}
                width={24}
                height={24}
                className={cfg.darkInvert ? 'dark:invert' : ''}
              />
              <span className="text-sm font-medium dark:text-white">
                {cfg.label}
              </span>
            </button>
          );
        })}
      </div>
    </CardShell>
  );
}

function EmptyClientsState() {
  return (
    <CardShell className="md:col-span-2 xl:col-span-3">
      <div className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="flex gap-2">
          {PROVIDER_ORDER.slice(0, 4).map((p) => {
            const cfg = PROVIDER_UI[p];
            return (
              <Image
                key={p}
                alt={cfg.label}
                src={cfg.icon}
                width={22}
                height={22}
                className={
                  cfg.darkInvert
                    ? 'opacity-40 dark:opacity-80 dark:invert'
                    : 'opacity-40 dark:opacity-80'
                }
              />
            );
          })}
        </div>
        <div className="flex max-w-sm flex-col gap-1">
          <span className="text-sm font-semibold dark:text-white">
            No auth clients yet
          </span>
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            Pick a provider to let users sign in with Google, Apple, GitHub,
            Clerk, Firebase, and more.
          </span>
        </div>
        <Button variant="primary">
          <PlusIcon height={14} /> Add client
        </Button>
      </div>
    </CardShell>
  );
}

type AddFlow = null | 'picker';

function ClientsTab({
  clients,
  addFlow,
}: {
  clients: OAuthClient[];
  addFlow: AddFlow;
}) {
  const hasClients = clients.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        title="Auth clients"
        description="Connect OAuth providers so your users can sign in with Google, Apple, GitHub, and others. Each client is one app registered with a provider."
        actions={
          <Button variant="primary">
            <PlusIcon height={14} /> Add client
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!hasClients && addFlow === null ? <EmptyClientsState /> : null}
        {addFlow === 'picker' ? <ProviderPickerCard /> : null}
        {clients.map((c) => (
          <ClientCard key={c.id} client={c} />
        ))}
        {hasClients && addFlow === null ? <AddClientCard /> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Origins tab
// ---------------------------------------------------------------------------

type OriginGroup = {
  key: AuthorizedOrigin['service'];
  title: string;
  description: string;
  placeholder: string;
  icon: React.ReactNode;
  format: (params: string[]) => string;
};

const ORIGIN_GROUPS: OriginGroup[] = [
  {
    key: 'generic',
    title: 'Website',
    description: 'Production and staging domains for your app.',
    placeholder: 'yoursite.com',
    icon: <GlobeAltIcon className="h-4 w-4" />,
    format: (p) => p[0] ?? '',
  },
  {
    key: 'vercel',
    title: 'Vercel previews',
    description: 'Preview deploys on Vercel matching this project name.',
    placeholder: 'my-project',
    icon: <CubeIcon className="h-4 w-4" />,
    format: (p) => `${p[1] ?? 'project'}-*.${p[0] ?? 'vercel.app'}`,
  },
  {
    key: 'netlify',
    title: 'Netlify previews',
    description: 'Deploy previews on Netlify matching this site name.',
    placeholder: 'my-site',
    icon: <CubeIcon className="h-4 w-4" />,
    format: (p) => `${p[0] ?? 'site'}--*.netlify.app`,
  },
  {
    key: 'custom-scheme',
    title: 'App scheme',
    description: 'Deep link scheme for native iOS and Android apps.',
    placeholder: 'myapp',
    icon: <CodeBracketIcon className="h-4 w-4" />,
    format: (p) => `${p[0] ?? 'myapp'}://`,
  },
];

function OriginChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <div className="group inline-flex items-center gap-1.5 rounded-full border bg-white py-1 pr-1 pl-3 text-xs dark:border-neutral-700 dark:bg-neutral-800">
      <span className="font-mono dark:text-neutral-200">{label}</span>
      <button
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-red-500/10"
      >
        <TrashIcon height={12} />
      </button>
    </div>
  );
}

function OriginGroupCard({
  group,
  origins,
}: {
  group: OriginGroup;
  origins: AuthorizedOrigin[];
}) {
  const matching = origins.filter((o) => o.service === group.key);
  return (
    <CardShell>
      <div className="flex items-start justify-between gap-3 border-b p-4 dark:border-neutral-700">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-gray-500 dark:text-neutral-400">
            {group.icon}
          </div>
          <div>
            <div className="text-sm font-semibold dark:text-white">
              {group.title}
            </div>
            <div className="text-xs text-gray-500 dark:text-neutral-400">
              {group.description}
            </div>
          </div>
        </div>
        <Button size="mini" variant="secondary">
          <PlusIcon height={12} /> Add
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 p-4">
        {matching.length === 0 ? (
          <span className="text-xs italic text-gray-400 dark:text-neutral-500">
            No {group.title.toLowerCase()} yet
          </span>
        ) : (
          matching.map((o) => (
            <OriginChip
              key={o.id}
              label={group.format(o.params)}
              onRemove={() => {}}
            />
          ))
        )}
      </div>
    </CardShell>
  );
}

function OriginsTab({ origins }: { origins: AuthorizedOrigin[] }) {
  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        title="Redirect origins"
        description="Allow-list the URLs your app runs on. OAuth redirects and magic code links are only permitted from these origins."
        actions={
          <Button variant="primary">
            <PlusIcon height={14} /> Add origin
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {ORIGIN_GROUPS.map((g) => (
          <OriginGroupCard key={g.key} group={g} origins={origins} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test users tab
// ---------------------------------------------------------------------------

function TestUsersTab({ users }: { users: TestUser[] }) {
  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        title="Test users"
        description="Test users have static magic codes that never expire. Useful for automated testing, dev workflows, and app store review."
        actions={
          <Button variant="primary">
            <PlusIcon height={14} /> Add test user
          </Button>
        }
      />
      {users.length === 0 ? (
        <CardShell>
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <UserGroupIcon className="h-8 w-8 text-gray-300 dark:text-neutral-600" />
            <div className="flex max-w-sm flex-col gap-1">
              <span className="text-sm font-semibold dark:text-white">
                No test users yet
              </span>
              <span className="text-xs text-gray-500 dark:text-neutral-400">
                Create a test user to get a magic code that never expires, handy
                for automated tests and app store review.
              </span>
            </div>
            <Button variant="secondary">
              <PlusIcon height={14} /> Add test user
            </Button>
          </div>
        </CardShell>
      ) : (
        <CardShell>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] border-b bg-gray-50 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-400">
            <div>Email</div>
            <div>Magic code</div>
            <div className="text-right">Actions</div>
          </div>
          {users.map((u, i) => (
            <div
              key={u.id}
              className={cn(
                'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-center px-4 py-3 text-sm',
                i !== users.length - 1
                  ? 'border-b dark:border-neutral-700/70'
                  : '',
                i % 2 === 1
                  ? 'bg-gray-50/50 dark:bg-neutral-800/30'
                  : '',
              )}
            >
              <div className="truncate dark:text-white">{u.email}</div>
              <div>
                <code className="rounded-sm bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-neutral-700/60 dark:text-neutral-200">
                  {u.code}
                </code>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="mini" variant="secondary">
                  <PencilSquareIcon className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="mini" variant="destructive">
                  <TrashIcon height={12} />
                </Button>
              </div>
            </div>
          ))}
        </CardShell>
      )}
      <Content className="text-xs text-gray-500 dark:text-neutral-400">
        Tip: create one test user per environment (QA, staging, app-store
        review) so codes stay easy to rotate.
      </Content>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email tab
// ---------------------------------------------------------------------------

type EmailState = 'collapsed' | 'pending' | 'confirmed';

const DEFAULT_SUBJECT = '{code} is your code for {app_title}';
const DEFAULT_FROM = 'Instant Show HN';
const DEFAULT_BODY = `<div style="background: #f6f6f6; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; font-size: 18px;">
  <div style="max-width: 650px; margin: 0 auto; background: white; padding: 20px">
    <p><strong>Welcome,</strong></p>
    <p>
      You asked to join {app_title}. To complete your registration, use this
      verification code:
    </p>
    <h2 style="text-align: center"><strong>{code}</strong></h2>
  </div>
</div>`;

function VariableName({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border bg-white px-1 font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">
      {'{'}
      {children}
      {'}'}
    </span>
  );
}

function EmailPreviewCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-sm border dark:border-neutral-700">
      <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800/50">
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
          <EnvelopeIcon className="h-3.5 w-3.5" />
          <span>Live preview</span>
        </div>
        <Badge tone="green">Rendered</Badge>
      </div>
      <div className="flex flex-col gap-1 border-b bg-white px-4 py-3 text-xs dark:border-neutral-700 dark:bg-neutral-800">
        <div>
          <span className="text-gray-400 dark:text-neutral-500">From </span>
          <span className="dark:text-neutral-200">
            Instant Show HN &lt;hi@yourdomain.co&gt;
          </span>
        </div>
        <div>
          <span className="text-gray-400 dark:text-neutral-500">To </span>
          <span className="dark:text-neutral-200">happyuser@gmail.com</span>
        </div>
        <div>
          <span className="text-gray-400 dark:text-neutral-500">Subject </span>
          <span className="font-medium dark:text-white">
            424242 is your code for instant show hn
          </span>
        </div>
      </div>
      <div className="flex grow items-stretch justify-center bg-[#f6f6f6] p-6 dark:bg-neutral-900/60">
        <div
          className="w-full max-w-[420px] rounded-sm bg-white p-5"
          style={{
            fontFamily: 'Helvetica, Arial, sans-serif',
            lineHeight: 1.6,
            fontSize: 14,
            color: '#111',
          }}
        >
          <p>
            <strong>Welcome,</strong>
          </p>
          <p>
            You asked to join instant show hn. To complete your registration,
            use this verification code:
          </p>
          <h2 style={{ textAlign: 'center', margin: '20px 0' }}>
            <strong>424242</strong>
          </h2>
        </div>
      </div>
    </div>
  );
}

function VerificationStrip({ confirmed }: { confirmed: boolean }) {
  return (
    <CardShell>
      <div className="flex flex-col gap-1 border-b p-4 dark:border-neutral-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircleIcon
              className={cn(
                'h-4 w-4',
                confirmed ? 'text-green-500' : 'text-gray-300 dark:text-neutral-600',
              )}
            />
            <SubsectionHeading>hi@yourdomain.co</SubsectionHeading>
            {confirmed ? (
              <Badge tone="green">Verified</Badge>
            ) : (
              <Badge tone="amber">Pending</Badge>
            )}
          </div>
          <Button size="mini" variant="secondary">
            Refresh status
          </Button>
        </div>
        <Content className="text-xs text-gray-500 dark:text-neutral-400">
          Emails to your users are sent from this address. DKIM and
          Return-Path records improve deliverability.
        </Content>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        <div className="flex flex-col gap-1 border-b p-4 md:border-b-0 md:border-r dark:border-neutral-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium dark:text-neutral-200">
              Email confirmation
            </span>
            <div className="flex items-center gap-2">
              <StatusCircle isSuccess={confirmed} />
              <span
                className={cn(
                  'text-[10px] font-medium',
                  confirmed ? 'text-green-600' : 'text-amber-600',
                )}
              >
                {confirmed ? 'Confirmed' : 'Pending'}
              </span>
            </div>
          </div>
          <span className="text-[11px] text-gray-500 dark:text-neutral-400">
            {confirmed
              ? 'Ownership of the sender address is confirmed.'
              : 'We sent a confirmation email. Click the link to verify ownership.'}
          </span>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium dark:text-neutral-200">
              DNS records
            </span>
            {confirmed ? (
              <Badge tone="green">All set</Badge>
            ) : (
              <Badge tone="amber">Waiting</Badge>
            )}
          </div>
          <div className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-20 font-mono text-gray-500 dark:text-neutral-500">
                DKIM
              </span>
              <code className="flex-1 truncate rounded-sm bg-gray-50 px-2 py-1 font-mono dark:bg-neutral-700/60 dark:text-neutral-200">
                20240101._domainkey.yourdomain.co
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 font-mono text-gray-500 dark:text-neutral-500">
                Return-Path
              </span>
              <code className="flex-1 truncate rounded-sm bg-gray-50 px-2 py-1 font-mono dark:bg-neutral-700/60 dark:text-neutral-200">
                pm-bounces.yourdomain.co
              </code>
            </div>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function ExpirySelector() {
  const [value, setValue] = useState<'10' | '60' | '1440'>('10');
  const options: { id: '10' | '60' | '1440'; label: string }[] = [
    { id: '10', label: '10 min' },
    { id: '60', label: '1 hour' },
    { id: '1440', label: '24 hours' },
  ];
  return (
    <div className="inline-flex rounded-sm border bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-800">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setValue(o.id)}
          className={cn(
            'cursor-pointer rounded-sm px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.id
              ? 'bg-blue-500 text-white'
              : 'text-gray-600 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function EmailCollapsedCard() {
  return (
    <CardShell>
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <EnvelopeIcon className="h-8 w-8 text-gray-300 dark:text-neutral-600" />
        <div className="flex max-w-sm flex-col gap-1">
          <span className="text-sm font-semibold dark:text-white">
            Using the default magic code email
          </span>
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            Customize the subject, body, and sender to match your brand.
          </span>
        </div>
        <Button variant="primary">
          <PencilSquareIcon className="h-3.5 w-3.5" /> Customize email
        </Button>
      </div>
    </CardShell>
  );
}

function EmailTab({ state }: { state: EmailState }) {
  if (state === 'collapsed') {
    return (
      <div className="flex flex-col gap-6">
        <TabHeader
          title="Magic code email"
          description="Customize the email users receive when they request a magic code. Use template variables to personalize per-user content."
        />
        <EmailCollapsedCard />
      </div>
    );
  }
  const confirmed = state === 'confirmed';
  return (
    <div className="flex flex-col gap-6">
      <TabHeader
        title="Magic code email"
        description="Customize the email users receive when they request a magic code. Use template variables to personalize per-user content."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary">Delete template</Button>
            <Button variant="primary">Save changes</Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <CardShell>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <SubsectionHeading>Template</SubsectionHeading>
                <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-neutral-400">
                  <span>Variables:</span>
                  <VariableName>code</VariableName>
                  <VariableName>app_title</VariableName>
                  <VariableName>user_email</VariableName>
                </div>
              </div>
              <TextInput
                label="Subject"
                value={DEFAULT_SUBJECT}
                onChange={() => {}}
              />
              <TextInput
                label="From name"
                value={DEFAULT_FROM}
                onChange={() => {}}
              />
              <div className="flex flex-col gap-1">
                <Label>Body (HTML or plain-text)</Label>
                <TextArea
                  value={DEFAULT_BODY}
                  onChange={() => {}}
                  rows={10}
                />
              </div>
            </div>
          </CardShell>
          <CardShell>
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <SubsectionHeading>Magic code lifetime</SubsectionHeading>
                <ExpirySelector />
              </div>
              <Content className="text-xs text-gray-500 dark:text-neutral-400">
                How long a magic code remains valid once issued. Shorter
                lifetimes are more secure; longer lifetimes are friendlier for
                slow email clients.
              </Content>
            </div>
          </CardShell>
        </div>
        <div className="lg:col-span-2">
          <EmailPreviewCard />
        </div>
      </div>
      <VerificationStrip confirmed={confirmed} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

type Snapshot = {
  id: string;
  label: string;
  clients: OAuthClient[];
  origins: AuthorizedOrigin[];
  testUsers: TestUser[];
  email: EmailState;
  addFlow: AddFlow;
  defaultTab?: TabId;
};

const SNAPSHOTS: Snapshot[] = [
  {
    id: 'empty',
    label: 'Fresh app (empty)',
    clients: [],
    origins: [],
    testUsers: [],
    email: 'collapsed',
    addFlow: null,
    defaultTab: 'clients',
  },
  {
    id: 'picker',
    label: 'Add client → picker',
    clients: [],
    origins: [],
    testUsers: [],
    email: 'collapsed',
    addFlow: 'picker',
    defaultTab: 'clients',
  },
  {
    id: 'one-google',
    label: 'Google web (shared dev creds)',
    clients: [googleSharedClient],
    origins: [],
    testUsers: [],
    email: 'collapsed',
    addFlow: null,
    defaultTab: 'clients',
  },
  {
    id: 'populated',
    label: '3 providers (Clients tab)',
    clients: [googleCustomClient, appleClient, githubClient],
    origins: ORIGIN_WEBSITE_ONLY,
    testUsers: [],
    email: 'collapsed',
    addFlow: null,
    defaultTab: 'clients',
  },
  {
    id: 'origins-demo',
    label: 'Redirect origins (all 4 types)',
    clients: [googleCustomClient, appleClient, githubClient],
    origins: ORIGINS_FULL,
    testUsers: [],
    email: 'collapsed',
    addFlow: null,
    defaultTab: 'origins',
  },
  {
    id: 'test-users-demo',
    label: 'Test users populated',
    clients: [googleCustomClient, appleClient, githubClient],
    origins: ORIGINS_FULL,
    testUsers: TEST_USERS_FULL,
    email: 'collapsed',
    addFlow: null,
    defaultTab: 'users',
  },
  {
    id: 'email-pending',
    label: 'Email sender PENDING',
    clients: [googleCustomClient, appleClient, githubClient],
    origins: ORIGIN_WEBSITE_ONLY,
    testUsers: [],
    email: 'pending',
    addFlow: null,
    defaultTab: 'email',
  },
  {
    id: 'full-production',
    label: 'Full production',
    clients: [
      googleCustomClient,
      googleIosClient,
      appleClient,
      githubClient,
      clerkClient,
    ],
    origins: ORIGINS_FULL,
    testUsers: TEST_USERS_FULL,
    email: 'confirmed',
    addFlow: null,
    defaultTab: 'clients',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AuthUIV1Page() {
  const [idx, setIdx] = useState(0);
  const snapshot = SNAPSHOTS[idx];
  const [activeTab, setActiveTab] = useState<TabId>(
    snapshot.defaultTab ?? 'clients',
  );
  const { darkMode } = useDarkMode();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  useEffect(() => {
    setActiveTab(snapshot.defaultTab ?? 'clients');
  }, [idx, snapshot.defaultTab]);

  const prev = () =>
    setIdx((i) => (i - 1 + SNAPSHOTS.length) % SNAPSHOTS.length);
  const next = () => setIdx((i) => (i + 1) % SNAPSHOTS.length);

  const counts: Record<TabId, number | null> = {
    clients: snapshot.clients.length,
    origins: snapshot.origins.length,
    users: snapshot.testUsers.length,
    email: null,
  };

  return (
    <TokenContext.Provider value="fake-showcase-token">
      <Head>
        <title>Auth UI v1</title>
      </Head>
      <div
        className={cn(
          'flex h-[100dvh] w-full flex-col',
          darkMode ? 'dark' : '',
        )}
      >
        <DashTopBar />
        <div className="flex w-full grow flex-col overflow-hidden dark:bg-neutral-900 dark:text-white">
          <DashAppHeader />
          <div className="flex w-full grow flex-col overflow-hidden md:flex-row">
            <DashSidebar />
            <div
              key={snapshot.id}
              className="flex flex-1 grow flex-col overflow-y-auto bg-gray-50/40 dark:bg-neutral-900"
            >
              <TabStrip
                activeTab={activeTab}
                onSelect={setActiveTab}
                counts={counts}
              />
              <div className="mx-auto w-full max-w-6xl px-6 py-6">
                {activeTab === 'clients' ? (
                  <ClientsTab
                    clients={snapshot.clients}
                    addFlow={snapshot.addFlow}
                  />
                ) : null}
                {activeTab === 'origins' ? (
                  <OriginsTab origins={snapshot.origins} />
                ) : null}
                {activeTab === 'users' ? (
                  <TestUsersTab users={snapshot.testUsers} />
                ) : null}
                {activeTab === 'email' ? (
                  <EmailTab state={snapshot.email} />
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2 rounded-md border bg-white/95 px-3 py-2 shadow-md backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
          <button
            onClick={prev}
            aria-label="Previous state"
            className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            ←
          </button>
          <select
            value={snapshot.id}
            onChange={(e) =>
              setIdx(SNAPSHOTS.findIndex((s) => s.id === e.target.value))
            }
            className="max-w-[18rem] cursor-pointer rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            {SNAPSHOTS.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}/{SNAPSHOTS.length} · {s.label}
              </option>
            ))}
          </select>
          <button
            onClick={next}
            aria-label="Next state"
            className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            →
          </button>
        </div>
      </div>
    </TokenContext.Provider>
  );
}

export default asClientOnlyPage(AuthUIV1Page);

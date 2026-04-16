import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import type { StaticImageData } from 'next/image';
import {
  ChevronDownIcon as ChevronDownSolidIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import {
  ArrowTopRightOnSquareIcon,
  BeakerIcon,
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
  UserIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';

import { asClientOnlyPage } from '@/components/clientOnlyPage';
import { TokenContext } from '@/lib/contexts';
import { DarkModeToggle, useDarkMode } from '@/components/dash/DarkModeToggle';
import {
  Button,
  cn,
  SmallCopyable,
  TextArea,
  TextInput,
  ToggleCollection,
} from '@/components/ui';

import googleIconSvg from '../../public/img/google_g.svg';
import appleIconSvg from '../../public/img/apple_logo_black.svg';
import githubIconSvg from '../../public/img/github.svg';
import linkedinIconSvg from '../../public/img/linkedin.svg';
import clerkIconSvg from '../../public/img/clerk_logo_black.svg';
import firebaseIconSvg from '../../public/img/firebase_auth.svg';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type ProviderType =
  | 'google'
  | 'apple'
  | 'github'
  | 'linkedin'
  | 'clerk'
  | 'firebase';

type AppType = 'web' | 'ios';

type Client = {
  id: string;
  name: string;
  provider: ProviderType;
  clientId: string;
  appType?: AppType;
  redirectTo?: string;
  shared?: boolean;
  subtitle?: string;
};

const MOCK_APP = {
  title: 'instant show hn',
  id: 'mock-app-id-0000-0000-000000000000',
};

const googleWebClient: Client = {
  id: 'c-google-web',
  name: 'google-web',
  provider: 'google',
  clientId: '123456789-abc.apps.googleusercontent.com',
  appType: 'web',
  redirectTo: 'https://yoursite.com/oauth/callback',
};

const googleSharedClient: Client = {
  id: 'c-google-shared',
  name: 'google-web',
  provider: 'google',
  clientId: 'shared-dev-client-id',
  appType: 'web',
  shared: true,
};

const googleIosClient: Client = {
  id: 'c-google-ios',
  name: 'google-ios',
  provider: 'google',
  clientId: 'ios-client-id',
  appType: 'ios',
  subtitle: 'Skip nonce checks',
};

const appleClient: Client = {
  id: 'c-apple',
  name: 'apple',
  provider: 'apple',
  clientId: 'com.example.services',
  subtitle: 'Team TEAM1234 · Key KEY5678',
};

const githubClient: Client = {
  id: 'c-github',
  name: 'github-web',
  provider: 'github',
  clientId: 'Iv1.abcdef0123456789',
  redirectTo: 'https://yoursite.com/oauth/callback',
};

const clerkClient: Client = {
  id: 'c-clerk',
  name: 'clerk',
  provider: 'clerk',
  clientId: 'pk_test_Y2xlYW4tY2F0LTIwLmNsZXJrLmFjY291bnRzLmRldiQ',
  subtitle: 'clean-cat-20.clerk.accounts.dev',
};

type Origin =
  | { id: string; kind: 'website'; value: string }
  | { id: string; kind: 'vercel'; team: string; project: string }
  | { id: string; kind: 'netlify'; site: string }
  | { id: string; kind: 'scheme'; value: string };

const ORIGIN_WEB: Origin = {
  id: 'o-web',
  kind: 'website',
  value: 'yoursite.com',
};

const ORIGINS_FULL: Origin[] = [
  ORIGIN_WEB,
  { id: 'o-vercel', kind: 'vercel', team: 'vercel.app', project: 'my-project' },
  { id: 'o-netlify', kind: 'netlify', site: 'my-site' },
  { id: 'o-scheme', kind: 'scheme', value: 'myapp' },
];

type TestUser = { id: string; email: string; code: string };

const TEST_USERS_FULL: TestUser[] = [
  { id: 't1', email: 'alice@example.com', code: '424242' },
  { id: 't2', email: 'appstore-review@example.com', code: '123456' },
];

const DEFAULT_EMAIL_BODY = `<div style="background:#f6f6f6;font-family:Helvetica,Arial,sans-serif;line-height:1.6;font-size:18px">
  <div style="max-width:650px;margin:0 auto;background:white;padding:20px">
    <p><strong>Welcome,</strong></p>
    <p>You asked to join {app_title}. To complete your registration, use this verification code:</p>
    <h2 style="text-align:center"><strong>{code}</strong></h2>
  </div>
</div>`;

// ---------------------------------------------------------------------------
// Provider UI config
// ---------------------------------------------------------------------------

const PROVIDER_UI: Record<
  ProviderType,
  { label: string; icon: StaticImageData; darkInvert?: boolean }
> = {
  google: { label: 'Google', icon: googleIconSvg },
  apple: { label: 'Apple', icon: appleIconSvg, darkInvert: true },
  github: { label: 'GitHub', icon: githubIconSvg, darkInvert: true },
  linkedin: { label: 'LinkedIn', icon: linkedinIconSvg },
  clerk: { label: 'Clerk', icon: clerkIconSvg, darkInvert: true },
  firebase: { label: 'Firebase', icon: firebaseIconSvg },
};

const PROVIDER_ORDER: ProviderType[] = [
  'google',
  'apple',
  'github',
  'linkedin',
  'clerk',
  'firebase',
];

const APP_TYPE_LABEL: Record<AppType, string> = {
  web: 'Web',
  ios: 'iOS',
};

// ---------------------------------------------------------------------------
// Primitives (inner content)
// ---------------------------------------------------------------------------

function ProviderLogoTile({
  provider,
  size = 'md',
}: {
  provider: ProviderType;
  size?: 'sm' | 'md';
}) {
  const cfg = PROVIDER_UI[provider];
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const px = size === 'sm' ? 14 : 18;
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-800',
        dim,
      )}
    >
      <Image
        src={cfg.icon}
        alt={cfg.label}
        width={px}
        height={px}
        className={cfg.darkInvert ? 'dark:invert' : ''}
      />
    </div>
  );
}

function StatusDot({
  tone,
}: {
  tone: 'green' | 'amber' | 'gray';
}) {
  const tones = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    gray: 'bg-gray-300 dark:bg-neutral-600',
  };
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', tones[tone])}
    />
  );
}

function Pill({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: 'gray' | 'blue' | 'green';
}) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
    green:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function DetailHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6 dark:border-neutral-800">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
          {title}
        </h1>
        <p className="max-w-xl text-sm text-gray-500 dark:text-neutral-400">
          {description}
        </p>
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium tracking-wide text-gray-700 uppercase dark:text-neutral-300">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-xs text-gray-500 dark:text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner rail (master) + sections (detail)
// ---------------------------------------------------------------------------

type SectionId = 'clients' | 'origins' | 'testUsers' | 'email';

type RailEntry = {
  id: SectionId;
  label: string;
  count: string;
  icon: React.ReactNode;
};

function InnerRailItem({
  entry,
  active,
  onSelect,
}: {
  entry: RailEntry;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
        active
          ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200 dark:bg-neutral-800 dark:text-white dark:ring-neutral-700'
          : 'text-gray-600 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800/60',
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center',
          active
            ? 'text-gray-900 dark:text-white'
            : 'text-gray-400 dark:text-neutral-500',
        )}
      >
        {entry.icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{entry.label}</span>
        <span className="text-xs text-gray-500 dark:text-neutral-500">
          {entry.count}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Clients section
// ---------------------------------------------------------------------------

function ClientRow({ client }: { client: Client }) {
  const cfg = PROVIDER_UI[client.provider];
  return (
    <div className="group flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0 hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50">
      <ProviderLogoTile provider={client.provider} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
            {client.name}
          </span>
          <span className="text-xs text-gray-400 dark:text-neutral-500">
            {cfg.label}
          </span>
          {client.shared ? <Pill tone="blue">shared dev</Pill> : null}
          {client.appType ? <Pill>{APP_TYPE_LABEL[client.appType]}</Pill> : null}
        </div>
        <span className="truncate font-mono text-xs text-gray-500 dark:text-neutral-400">
          {client.clientId}
        </span>
        {client.subtitle ? (
          <span className="truncate text-xs text-gray-500 dark:text-neutral-500">
            {client.subtitle}
          </span>
        ) : null}
      </div>
      <button className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 opacity-0 hover:bg-gray-100 group-hover:opacity-100 dark:text-neutral-300 dark:hover:bg-neutral-700">
        Edit
      </button>
    </div>
  );
}

function EmptyClients() {
  return (
    <div className="flex flex-col items-center gap-5 rounded-lg border border-dashed border-gray-300 bg-gray-50/40 px-6 py-16 text-center dark:border-neutral-700 dark:bg-neutral-800/30">
      <div className="flex gap-2">
        {PROVIDER_ORDER.slice(0, 4).map((p) => (
          <ProviderLogoTile key={p} provider={p} size="sm" />
        ))}
      </div>
      <div className="flex max-w-sm flex-col gap-1">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Add your first auth client
        </h3>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          Connect Google, Apple, GitHub, LinkedIn, Clerk, or Firebase to enable
          social sign-in for your app.
        </p>
      </div>
      <Button variant="primary">
        <PlusIcon height={14} /> Add client
      </Button>
    </div>
  );
}

function ProviderPicker() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Select an auth provider
        </h3>
        <p className="text-xs text-gray-500 dark:text-neutral-400">
          Pick the identity service you'd like to configure.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PROVIDER_ORDER.map((p) => {
          const cfg = PROVIDER_UI[p];
          return (
            <button
              key={p}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-5 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
            >
              <Image
                src={cfg.icon}
                alt={cfg.label}
                width={22}
                height={22}
                className={cfg.darkInvert ? 'dark:invert' : ''}
              />
              <span className="text-sm text-gray-800 dark:text-neutral-200">
                {cfg.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button variant="secondary">Cancel</Button>
      </div>
    </div>
  );
}

function ClientsDetail({
  clients,
  showPicker,
}: {
  clients: Client[];
  showPicker: boolean;
}) {
  const hasClients = clients.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title="Auth clients"
        description="Identity passports for your app. Each client maps to one provider, one app type, and one set of credentials."
        action={
          hasClients || showPicker ? (
            <Button variant="primary">
              <PlusIcon height={14} /> Add client
            </Button>
          ) : null
        }
      />

      {showPicker ? <ProviderPicker /> : null}

      {hasClients ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {clients.map((c) => (
            <ClientRow key={c.id} client={c} />
          ))}
        </div>
      ) : !showPicker ? (
        <EmptyClients />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Origins section
// ---------------------------------------------------------------------------

function originDisplay(o: Origin): { title: string; sub: string } {
  switch (o.kind) {
    case 'website':
      return { title: o.value, sub: 'Website' };
    case 'vercel':
      return {
        title: `${o.project}.${o.team}`,
        sub: 'Vercel previews',
      };
    case 'netlify':
      return { title: `${o.site}.netlify.app`, sub: 'Netlify previews' };
    case 'scheme':
      return { title: `${o.value}://`, sub: 'Native app scheme' };
  }
}

const ORIGIN_GROUP_LABELS: Record<Origin['kind'], string> = {
  website: 'Websites',
  vercel: 'Vercel',
  netlify: 'Netlify',
  scheme: 'Native app schemes',
};

function OriginChip({ origin }: { origin: Origin }) {
  const { title } = originDisplay(origin);
  return (
    <div className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pr-1 pl-3 text-xs text-gray-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
      <span className="font-mono">{title}</span>
      <button
        aria-label="Remove origin"
        className="cursor-pointer rounded-full p-1 text-gray-400 opacity-0 hover:bg-gray-100 hover:text-red-500 group-hover:opacity-100 dark:text-neutral-500 dark:hover:bg-neutral-700"
      >
        <TrashIcon height={10} width={10} />
      </button>
    </div>
  );
}

function OriginsDetail({ origins }: { origins: Origin[] }) {
  const groups = useMemo(() => {
    const map = new Map<Origin['kind'], Origin[]>();
    for (const o of origins) {
      const arr = map.get(o.kind) ?? [];
      arr.push(o);
      map.set(o.kind, arr);
    }
    return map;
  }, [origins]);

  const kinds: Origin['kind'][] = ['website', 'vercel', 'netlify', 'scheme'];

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title="Redirect origins"
        description="URLs that are allowed to start OAuth flows for this app. Anything not in this list is rejected."
        action={
          origins.length > 0 ? (
            <Button variant="primary">
              <PlusIcon height={14} /> Add origin
            </Button>
          ) : null
        }
      />

      {origins.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/40 px-6 py-16 text-center dark:border-neutral-700 dark:bg-neutral-800/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-gray-200 dark:bg-neutral-800 dark:ring-neutral-700">
            <GlobeAltIcon className="h-5 w-5 text-gray-400 dark:text-neutral-500" />
          </div>
          <div className="flex max-w-sm flex-col gap-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              No origins added yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              Add your site's URL so it can initiate the OAuth flow. You can
              add websites, Vercel previews, Netlify sites, or native schemes.
            </p>
          </div>
          <Button variant="primary">
            <PlusIcon height={14} /> Add origin
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {kinds.map((k) => {
            const list = groups.get(k);
            if (!list || list.length === 0) return null;
            return (
              <div key={k} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {ORIGIN_GROUP_LABELS[k]}
                  </h3>
                  <span className="text-xs text-gray-400 dark:text-neutral-500">
                    {list.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {list.map((o) => (
                    <OriginChip key={o.id} origin={o} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test users section
// ---------------------------------------------------------------------------

function TestUsersDetail({ users }: { users: TestUser[] }) {
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title="Test users"
        description="Static magic codes that never expire. Useful during development, automated testing, and app-store review."
        action={
          users.length > 0 ? (
            <Button variant="primary">
              <PlusIcon height={14} /> Add test user
            </Button>
          ) : null
        }
      />

      {users.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/40 px-6 py-16 text-center dark:border-neutral-700 dark:bg-neutral-800/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-gray-200 dark:bg-neutral-800 dark:ring-neutral-700">
            <UsersIcon className="h-5 w-5 text-gray-400 dark:text-neutral-500" />
          </div>
          <div className="flex max-w-sm flex-col gap-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              No test users yet
            </h3>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              Create a test user with a fixed code to simplify sign-in during
              development and app-store review.
            </p>
          </div>
          <Button variant="primary">
            <PlusIcon height={14} /> Add test user
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Magic code</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr
                  key={u.id}
                  className={cn(
                    i % 2 === 1
                      ? 'bg-gray-50/60 dark:bg-neutral-800/30'
                      : 'bg-white dark:bg-neutral-900',
                  )}
                >
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700 dark:text-neutral-200">
                    {u.code}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      aria-label="Remove test user"
                      className="cursor-pointer text-gray-400 hover:text-red-500 dark:text-neutral-500"
                    >
                      <TrashIcon height={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email template section
// ---------------------------------------------------------------------------

type EmailState = 'collapsed' | 'pending' | 'confirmed';

function VariableRef({ name }: { name: string }) {
  return (
    <span className="inline-flex rounded-sm border border-gray-200 bg-gray-50 px-1.5 font-mono text-[11px] text-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
      {'{'}
      {name}
      {'}'}
    </span>
  );
}

function EmailPreview({
  fromName,
  subject,
}: {
  fromName: string;
  subject: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-neutral-400">
        Live preview
      </span>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start gap-3 border-b border-gray-100 p-4 dark:border-neutral-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 dark:bg-neutral-800 dark:text-neutral-200">
            {fromName[0] ?? '?'}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {fromName}
              </span>
              <span className="text-xs text-gray-400 dark:text-neutral-500">
                now
              </span>
            </div>
            <span className="truncate text-sm text-gray-700 dark:text-neutral-200">
              {subject
                .replace('{code}', '424242')
                .replace('{app_title}', MOCK_APP.title)}
            </span>
          </div>
        </div>
        <div className="bg-[#f6f6f6] p-5">
          <div className="mx-auto max-w-[420px] rounded-md bg-white p-5 text-[15px] leading-relaxed text-gray-900">
            <p className="mb-3">
              <strong>Welcome,</strong>
            </p>
            <p className="mb-4">
              You asked to join <strong>{MOCK_APP.title}</strong>. To complete
              your registration, use this verification code:
            </p>
            <div className="my-2 flex justify-center">
              <span className="font-mono text-2xl font-bold tracking-[0.2em] text-gray-900">
                424242
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SenderStatusCard({ state }: { state: 'pending' | 'confirmed' }) {
  if (state === 'confirmed') {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot tone="green" />
            <span className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
              hi@yourdomain.co is verified
            </span>
          </div>
          <Button variant="secondary" size="mini">
            Re-check
          </Button>
        </div>
        <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
          Your sender is confirmed. Emails will send from this address.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot tone="amber" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Verify hi@yourdomain.co
          </span>
        </div>
        <Button variant="primary" size="mini">
          Refresh status
        </Button>
      </div>
      <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
        We sent a confirmation email. Click the link inside to confirm ownership
        of this address.
      </p>
    </div>
  );
}

function EmailDetail({ state }: { state: EmailState }) {
  const [subject, setSubject] = useState(
    '{code} is your code for {app_title}',
  );
  const [fromName, setFromName] = useState('Instant Show HN');
  const [body, setBody] = useState(DEFAULT_EMAIL_BODY);

  if (state === 'collapsed') {
    return (
      <div className="flex flex-col gap-6">
        <DetailHeader
          title="Magic code email"
          description="The note you send people to prove they're them. Customize the subject, sender, and body."
        />
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-gray-300 bg-gray-50/40 px-6 py-16 text-center dark:border-neutral-700 dark:bg-neutral-800/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-gray-200 dark:bg-neutral-800 dark:ring-neutral-700">
            <EnvelopeIcon className="h-5 w-5 text-gray-400 dark:text-neutral-500" />
          </div>
          <div className="flex max-w-sm flex-col gap-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Using the default template
            </h3>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              Emails are sent from our domain with a default template.
              Customize it to match your voice and send from your own address.
            </p>
          </div>
          <Button variant="primary">
            <PencilSquareIcon className="h-4 w-4" /> Customize email
          </Button>
        </div>
      </div>
    );
  }

  const senderState = state === 'confirmed' ? 'confirmed' : 'pending';

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        title="Magic code email"
        description="The note you send people to prove they're them. Write it with your voice, preview it live."
        action={
          <>
            <Button variant="secondary">Discard</Button>
            <Button variant="primary">Save</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* Form */}
        <div className="flex flex-col gap-5">
          <div className="rounded-md border border-gray-200 bg-gray-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
            <div className="mb-2 text-xs font-medium tracking-wide text-gray-700 uppercase dark:text-neutral-300">
              Template variables
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-neutral-400">
              <span className="inline-flex items-center gap-1.5">
                <VariableRef name="code" />
                the magic code
              </span>
              <span className="inline-flex items-center gap-1.5">
                <VariableRef name="app_title" />
                your app's title
              </span>
              <span className="inline-flex items-center gap-1.5">
                <VariableRef name="user_email" />
                the user's email
              </span>
            </div>
          </div>

          <Field label="Subject">
            <TextInput
              value={subject}
              onChange={(v: string) => setSubject(v)}
            />
          </Field>

          <Field label="From name">
            <TextInput
              value={fromName}
              onChange={(v: string) => setFromName(v)}
            />
          </Field>

          <Field label="Body (HTML or plain text)">
            <TextArea value={body} onChange={(v: string) => setBody(v)} rows={10} />
          </Field>

          <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                Custom sender address
              </div>
              <div className="text-xs text-gray-500 dark:text-neutral-400">
                By default emails come from our domain. Add your own to build
                trust with recipients.
              </div>
            </div>
            <TextInput
              value="hi@yourdomain.co"
              onChange={() => {}}
              placeholder="hi@yourdomain.co"
            />
            <SenderStatusCard state={senderState} />
          </div>

          {senderState === 'pending' || senderState === 'confirmed' ? (
            <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    DNS records
                  </div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400">
                    Improve deliverability and keep your emails out of spam.
                  </div>
                </div>
                <Pill tone={senderState === 'confirmed' ? 'green' : 'gray'}>
                  <StatusDot
                    tone={senderState === 'confirmed' ? 'green' : 'amber'}
                  />
                  {senderState === 'confirmed' ? 'Active' : 'Pending'}
                </Pill>
              </div>
              <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                <div className="grid grid-cols-[1fr_70px_2fr] border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium tracking-wide text-gray-500 uppercase dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                  <div>Record</div>
                  <div>Type</div>
                  <div>Value</div>
                </div>
                <div className="grid grid-cols-[1fr_70px_2fr] gap-2 border-b border-gray-100 px-3 py-3 text-xs dark:border-neutral-800 dark:text-white">
                  <div className="font-medium">DKIM</div>
                  <div className="text-gray-500 dark:text-neutral-400">TXT</div>
                  <div className="flex flex-col gap-1">
                    <code className="rounded-sm bg-gray-50 px-2 py-1 font-mono break-all select-all dark:bg-neutral-800">
                      20240101._domainkey.yourdomain.co
                    </code>
                    <code className="rounded-sm bg-gray-50 px-2 py-1 font-mono break-all select-all dark:bg-neutral-800">
                      k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUA...
                    </code>
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_70px_2fr] gap-2 px-3 py-3 text-xs dark:text-white">
                  <div className="font-medium">Return-Path</div>
                  <div className="text-gray-500 dark:text-neutral-400">
                    CNAME
                  </div>
                  <div className="flex flex-col gap-1">
                    <code className="rounded-sm bg-gray-50 px-2 py-1 font-mono break-all select-all dark:bg-neutral-800">
                      pm-bounces.yourdomain.co
                    </code>
                    <code className="rounded-sm bg-gray-50 px-2 py-1 font-mono break-all select-all dark:bg-neutral-800">
                      pm.mtasv.net
                    </code>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Preview column */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <EmailPreview fromName={fromName} subject={subject} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

type Snapshot = {
  id: string;
  label: string;
  clients: Client[];
  origins: Origin[];
  testUsers: TestUser[];
  email: EmailState;
  showPicker: boolean;
  defaultSection: SectionId;
};

const SNAPSHOTS: Snapshot[] = [
  {
    id: 'empty',
    label: 'Fresh app (empty)',
    clients: [],
    origins: [],
    testUsers: [],
    email: 'collapsed',
    showPicker: false,
    defaultSection: 'clients',
  },
  {
    id: 'picker',
    label: 'Add client → picker',
    clients: [],
    origins: [],
    testUsers: [],
    email: 'collapsed',
    showPicker: true,
    defaultSection: 'clients',
  },
  {
    id: 'one-google',
    label: 'Google web (shared dev creds)',
    clients: [googleSharedClient],
    origins: [],
    testUsers: [],
    email: 'collapsed',
    showPicker: false,
    defaultSection: 'clients',
  },
  {
    id: 'populated',
    label: '3 providers + origins',
    clients: [googleWebClient, appleClient, githubClient],
    origins: [ORIGIN_WEB],
    testUsers: [],
    email: 'collapsed',
    showPicker: false,
    defaultSection: 'clients',
  },
  {
    id: 'email-pending',
    label: 'Email sender PENDING',
    clients: [googleWebClient, appleClient, githubClient],
    origins: [ORIGIN_WEB],
    testUsers: [],
    email: 'pending',
    showPicker: false,
    defaultSection: 'email',
  },
  {
    id: 'full-production',
    label: 'Full production',
    clients: [
      googleWebClient,
      googleIosClient,
      appleClient,
      githubClient,
      clerkClient,
    ],
    origins: ORIGINS_FULL,
    testUsers: TEST_USERS_FULL,
    email: 'confirmed',
    showPicker: false,
    defaultSection: 'clients',
  },
];

// ---------------------------------------------------------------------------
// Shell: dash chrome (copied verbatim from auth-ui.tsx)
// ---------------------------------------------------------------------------

function PillButton({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex cursor-pointer items-center gap-2 rounded-sm border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
      {children}
    </div>
  );
}

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
// Content: master (inner rail) + detail
// ---------------------------------------------------------------------------

function AuthWorkspace({ snapshot }: { snapshot: Snapshot }) {
  const [section, setSection] = useState<SectionId>(snapshot.defaultSection);

  const railEntries: RailEntry[] = [
    {
      id: 'clients',
      label: 'Auth clients',
      count:
        snapshot.clients.length === 0
          ? 'None yet'
          : `${snapshot.clients.length} ${snapshot.clients.length === 1 ? 'client' : 'clients'}`,
      icon: <KeyIcon className="h-4 w-4" />,
    },
    {
      id: 'origins',
      label: 'Redirect origins',
      count:
        snapshot.origins.length === 0
          ? 'None yet'
          : `${snapshot.origins.length} ${snapshot.origins.length === 1 ? 'origin' : 'origins'}`,
      icon: <GlobeAltIcon className="h-4 w-4" />,
    },
    {
      id: 'testUsers',
      label: 'Test users',
      count:
        snapshot.testUsers.length === 0
          ? 'None yet'
          : `${snapshot.testUsers.length} ${snapshot.testUsers.length === 1 ? 'user' : 'users'}`,
      icon: <UsersIcon className="h-4 w-4" />,
    },
    {
      id: 'email',
      label: 'Email template',
      count:
        snapshot.email === 'collapsed'
          ? 'Default'
          : snapshot.email === 'confirmed'
            ? 'Custom · verified'
            : 'Custom · pending',
      icon: <EnvelopeIcon className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex min-h-full w-full flex-col md:flex-row">
      {/* Inner rail */}
      <aside className="w-full shrink-0 border-b border-gray-200 bg-gray-50/60 p-3 md:w-[220px] md:border-r md:border-b-0 dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="mb-2 px-3 pt-2 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-neutral-500">
          Authentication
        </div>
        <nav className="flex flex-col gap-0.5">
          {railEntries.map((e) => (
            <InnerRailItem
              key={e.id}
              entry={e}
              active={section === e.id}
              onSelect={() => setSection(e.id)}
            />
          ))}
        </nav>
      </aside>

      {/* Detail pane */}
      <main className="flex-1 overflow-y-auto bg-white dark:bg-neutral-900">
        <div className="mx-auto flex max-w-4xl flex-col px-6 py-8 md:px-10 md:py-10">
          {section === 'clients' ? (
            <ClientsDetail
              clients={snapshot.clients}
              showPicker={snapshot.showPicker}
            />
          ) : null}
          {section === 'origins' ? (
            <OriginsDetail origins={snapshot.origins} />
          ) : null}
          {section === 'testUsers' ? (
            <TestUsersDetail users={snapshot.testUsers} />
          ) : null}
          {section === 'email' ? <EmailDetail state={snapshot.email} /> : null}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AuthUIV3Page() {
  const [idx, setIdx] = useState(0);
  const { darkMode } = useDarkMode();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const snapshot = SNAPSHOTS[idx];
  const prev = () =>
    setIdx((i) => (i - 1 + SNAPSHOTS.length) % SNAPSHOTS.length);
  const next = () => setIdx((i) => (i + 1) % SNAPSHOTS.length);

  return (
    <TokenContext.Provider value="fake-showcase-token">
      <Head>
        <title>Auth UI · Workspace</title>
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
              className="flex flex-1 grow flex-col overflow-y-auto"
              key={snapshot.id}
            >
              <AuthWorkspace snapshot={snapshot} />
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

export default asClientOnlyPage(AuthUIV3Page);

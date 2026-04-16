import { useEffect, useState, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import {
  ChevronDownIcon as ChevronDownSolidIcon,
  PlusIcon,
} from '@heroicons/react/24/solid';
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
  UserIcon,
} from '@heroicons/react/24/outline';

import { asClientOnlyPage } from '@/components/clientOnlyPage';
import { TokenContext } from '@/lib/contexts';
import { DarkModeToggle, useDarkMode } from '@/components/dash/DarkModeToggle';
import {
  Button as InstantButton,
  cn,
  SmallCopyable,
  ToggleCollection,
} from '@/components/ui';

import googleIconSvg from '../../public/img/google_g.svg';
import appleIconSvg from '../../public/img/apple_logo_black.svg';
import githubIconSvg from '../../public/img/github.svg';
import linkedinIconSvg from '../../public/img/linkedin.svg';
import clerkIconSvg from '../../public/img/clerk_logo_black.svg';
import firebaseIconSvg from '../../public/img/firebase_auth.svg';

// ---------------------------------------------------------------------------
// Primitives — built from scratch with plain Tailwind.
// Goal: a Stripe-settings aesthetic, distinct from the Instant dash UI.
// ---------------------------------------------------------------------------

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1';
  const sizes = {
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-8 px-3 text-sm',
  };
  const variants = {
    primary:
      'bg-indigo-600 text-white hover:bg-indigo-700 shadow-[0_1px_0_rgba(0,0,0,0.05)]',
    secondary:
      'bg-white text-zinc-800 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700 dark:hover:bg-neutral-700',
    ghost:
      'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800',
    danger:
      'bg-white text-rose-600 ring-1 ring-inset ring-zinc-300 hover:bg-rose-50 hover:ring-rose-300 dark:bg-neutral-800 dark:ring-neutral-700 dark:hover:bg-rose-950/40',
  };
  return (
    <button
      className={cx(base, sizes[size], variants[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

function LinkButton({
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx(
        'text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'rounded-lg bg-white ring-1 ring-zinc-200/70 dark:bg-neutral-900 dark:ring-neutral-800',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-[13px] font-medium text-zinc-800 dark:text-neutral-200"
    >
      {children}
    </label>
  );
}

function TextInput({
  label,
  hint,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
}) {
  const id = rest.id || rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <input
        id={id}
        className={cx(
          'h-9 rounded-md bg-white px-3 text-sm text-zinc-900 ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-neutral-700 dark:placeholder:text-neutral-500',
          className,
        )}
        {...rest}
      />
      {hint && <div className="text-xs text-zinc-500 dark:text-neutral-500">{hint}</div>}
    </div>
  );
}

function TextArea({
  label,
  mono,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  mono?: boolean;
}) {
  const id = rest.id || rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <textarea
        id={id}
        className={cx(
          'rounded-md bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-neutral-700 dark:placeholder:text-neutral-500',
          mono && 'font-mono text-[12.5px] leading-relaxed',
          className,
        )}
        {...rest}
      />
    </div>
  );
}

function Select({
  label,
  children,
  ...rest
}: InputHTMLAttributes<HTMLSelectElement> & { label?: string; children: ReactNode }) {
  const id = rest.id || rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <select
        id={id}
        className="h-9 rounded-md bg-white px-3 text-sm text-zinc-900 ring-1 ring-inset ring-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-neutral-700"
      >
        {children}
      </select>
    </div>
  );
}

function Pill({
  children,
  tone = 'zinc',
}: {
  children: ReactNode;
  tone?: 'zinc' | 'green' | 'amber' | 'indigo';
}) {
  const tones = {
    zinc: 'bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

function Divider({ className }: { className?: string }) {
  return <div className={cx('h-px w-full bg-zinc-200 dark:bg-neutral-800', className)} />;
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        {eyebrow && (
          <div className="text-[11px] font-semibold tracking-[0.08em] text-zinc-500 uppercase dark:text-neutral-400">
            {eyebrow}
          </div>
        )}
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-neutral-100">
          {title}
        </h2>
        {description && (
          <p className="max-w-prose text-sm text-zinc-500 dark:text-neutral-400">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <div className="text-zinc-500 dark:text-neutral-400">{label}</div>
      <div className="font-mono text-zinc-800 dark:text-neutral-200">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider tile — a colored square with the provider wordmark.
// ---------------------------------------------------------------------------

type ProviderType =
  | 'google'
  | 'apple'
  | 'github'
  | 'linkedin'
  | 'clerk'
  | 'firebase';

const PROVIDERS: Record<
  ProviderType,
  {
    label: string;
    icon: any;
    tileBg: string;
    invert?: boolean;
  }
> = {
  google: { label: 'Google', icon: googleIconSvg, tileBg: 'bg-white ring-zinc-200 dark:bg-neutral-800 dark:ring-neutral-700' },
  apple: { label: 'Apple', icon: appleIconSvg, tileBg: 'bg-zinc-900 ring-zinc-900 dark:bg-neutral-200 dark:ring-neutral-200', invert: true },
  github: { label: 'GitHub', icon: githubIconSvg, tileBg: 'bg-zinc-900 ring-zinc-900 dark:bg-neutral-200 dark:ring-neutral-200', invert: true },
  linkedin: { label: 'LinkedIn', icon: linkedinIconSvg, tileBg: 'bg-[#0A66C2] ring-[#0A66C2]' },
  clerk: { label: 'Clerk', icon: clerkIconSvg, tileBg: 'bg-zinc-900 ring-zinc-900 dark:bg-neutral-200 dark:ring-neutral-200', invert: true },
  firebase: { label: 'Firebase', icon: firebaseIconSvg, tileBg: 'bg-white ring-zinc-200 dark:bg-neutral-800 dark:ring-neutral-700' },
};

function ProviderTile({
  provider,
  size = 'md',
}: {
  provider: ProviderType;
  size?: 'sm' | 'md';
}) {
  const cfg = PROVIDERS[provider];
  const dims = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const iconPx = size === 'sm' ? 14 : 18;
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-md ring-1 ring-inset',
        dims,
        cfg.tileBg,
      )}
    >
      <Image
        alt={`${cfg.label} logo`}
        src={cfg.icon}
        width={iconPx}
        height={iconPx}
        className={cfg.invert ? 'invert dark:invert-0' : ''}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline icons — small, hand-rolled so we don't depend on @/components/ui.
// ---------------------------------------------------------------------------

function IconCopy() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M7 3a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V5a2 2 0 00-2-2H7zm-3 6a2 2 0 012-2v8a2 2 0 002 2h6a2 2 0 01-2 2H6a2 2 0 01-2-2V9z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M10 4a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 0110 4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path
        fillRule="evenodd"
        d="M8.75 1a2.75 2.75 0 00-2.75 2.75V4H3.5a.75.75 0 000 1.5h.546l.546 9.82A2.75 2.75 0 007.338 18h5.324a2.75 2.75 0 002.746-2.68l.546-9.82h.546a.75.75 0 000-1.5H14V3.75A2.75 2.75 0 0011.25 1h-2.5zM12.5 4v-.25A1.25 1.25 0 0011.25 2.5h-2.5A1.25 1.25 0 007.5 3.75V4h5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconGlobe() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3a11 11 0 010 14M10 3a11 11 0 000 14" />
    </svg>
  );
}

function IconTriangle() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-zinc-800 dark:text-neutral-200">
      <path d="M10 3l7 13H3l7-13z" />
    </svg>
  );
}

function IconDot() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-teal-600">
      <circle cx="10" cy="10" r="4" />
    </svg>
  );
}

function IconMobile() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-4 w-4">
      <rect x="6" y="2" width="8" height="16" rx="1.5" />
      <path d="M9 15.5h2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const APP = {
  title: 'instant show hn',
  id: 'mock-app-id-0000-0000-000000000000',
};

type ClientEntry = {
  id: string;
  provider: ProviderType;
  name: string;
  clientId: string;
  subtitle?: string;
  redirect?: string;
  tags?: { label: string; tone?: 'green' | 'indigo' | 'zinc' }[];
  sharedCreds?: boolean;
};

const CLIENT_GOOGLE_WEB_SHARED: ClientEntry = {
  id: 'c-google-web-shared',
  provider: 'google',
  name: 'google-web',
  clientId: 'shared-dev-client-id',
  subtitle: 'Web client · Shared dev credentials',
  tags: [
    { label: 'Web', tone: 'zinc' },
    { label: 'Shared dev', tone: 'indigo' },
  ],
  sharedCreds: true,
};

const CLIENT_GOOGLE_WEB: ClientEntry = {
  id: 'c-google-web',
  provider: 'google',
  name: 'google-web',
  clientId: '123456789-abc.apps.googleusercontent.com',
  subtitle: 'Web client',
  redirect: 'https://yoursite.com/oauth/callback',
  tags: [{ label: 'Web', tone: 'zinc' }],
};

const CLIENT_GOOGLE_IOS: ClientEntry = {
  id: 'c-google-ios',
  provider: 'google',
  name: 'google-ios',
  clientId: 'ios-client-id.apps.googleusercontent.com',
  subtitle: 'iOS native',
  tags: [{ label: 'iOS', tone: 'zinc' }],
};

const CLIENT_APPLE: ClientEntry = {
  id: 'c-apple',
  provider: 'apple',
  name: 'apple',
  clientId: 'com.example.services',
  subtitle: 'Services ID · Team TEAM1234 · Key KEY5678',
};

const CLIENT_GITHUB: ClientEntry = {
  id: 'c-github',
  provider: 'github',
  name: 'github-web',
  clientId: 'Iv1.abcdef0123456789',
  redirect: 'https://yoursite.com/oauth/callback',
};

const CLIENT_CLERK: ClientEntry = {
  id: 'c-clerk',
  provider: 'clerk',
  name: 'clerk',
  clientId: 'clean-cat-20.clerk.accounts.dev',
  subtitle: 'Derived from pk_test_…ZXJr',
};

type Origin = {
  id: string;
  kind: 'website' | 'vercel' | 'netlify' | 'scheme';
  value: string;
  detail?: string;
};

const ORIGIN_WEB: Origin = { id: 'o-web', kind: 'website', value: 'https://yoursite.com' };
const ORIGIN_VERCEL: Origin = {
  id: 'o-vercel',
  kind: 'vercel',
  value: 'my-project.vercel.app',
  detail: 'Vercel preview deploys',
};
const ORIGIN_NETLIFY: Origin = {
  id: 'o-netlify',
  kind: 'netlify',
  value: 'my-site.netlify.app',
  detail: 'Netlify preview deploys',
};
const ORIGIN_SCHEME: Origin = {
  id: 'o-scheme',
  kind: 'scheme',
  value: 'myapp://',
  detail: 'Native app scheme',
};

const ALL_ORIGINS: Origin[] = [ORIGIN_WEB, ORIGIN_VERCEL, ORIGIN_NETLIFY, ORIGIN_SCHEME];

type TestUser = { id: string; email: string; code: string; created: string };

const TEST_USERS_FULL: TestUser[] = [
  {
    id: 't1',
    email: 'alice@example.com',
    code: '424242',
    created: 'Jan 12, 2026',
  },
  {
    id: 't2',
    email: 'appstore-review@example.com',
    code: '123456',
    created: 'Feb 04, 2026',
  },
];

const EMAIL_BODY = `<div style="background: #f6f6f6; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; font-size: 18px;">
  <div style="max-width: 650px; margin: 0 auto; background: white; padding: 20px">
    <p><strong>Welcome,</strong></p>
    <p>
      You asked to join {app_title}. To complete your registration, use this
      verification code:
    </p>
    <h2 style="text-align: center"><strong>{code}</strong></h2>
  </div>
</div>`;

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

type EmailState = 'collapsed' | 'pending' | 'confirmed';
type AddFlow = null | 'picker';

type Snapshot = {
  id: string;
  label: string;
  clients: ClientEntry[];
  origins: Origin[];
  testUsers: TestUser[];
  email: EmailState;
  addFlow: AddFlow;
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
  },
  {
    id: 'picker',
    label: 'Add client → picker',
    clients: [],
    origins: [],
    testUsers: [],
    email: 'collapsed',
    addFlow: 'picker',
  },
  {
    id: 'one-google',
    label: 'Google web (shared dev creds)',
    clients: [CLIENT_GOOGLE_WEB_SHARED],
    origins: [],
    testUsers: [],
    email: 'collapsed',
    addFlow: null,
  },
  {
    id: 'populated',
    label: '3 providers + origins',
    clients: [CLIENT_GOOGLE_WEB, CLIENT_APPLE, CLIENT_GITHUB],
    origins: [ORIGIN_WEB],
    testUsers: [],
    email: 'collapsed',
    addFlow: null,
  },
  {
    id: 'email-pending',
    label: 'Email sender PENDING',
    clients: [CLIENT_GOOGLE_WEB, CLIENT_APPLE, CLIENT_GITHUB],
    origins: [ORIGIN_WEB],
    testUsers: [],
    email: 'pending',
    addFlow: null,
  },
  {
    id: 'full-production',
    label: 'Full production',
    clients: [
      CLIENT_GOOGLE_WEB,
      CLIENT_GOOGLE_IOS,
      CLIENT_APPLE,
      CLIENT_GITHUB,
      CLIENT_CLERK,
    ],
    origins: ALL_ORIGINS,
    testUsers: TEST_USERS_FULL,
    email: 'confirmed',
    addFlow: null,
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PageHeader() {
  return (
    <div className="flex flex-col gap-4 pt-10 pb-8">
      <div className="flex items-center gap-1.5 text-[12.5px] text-zinc-500 dark:text-neutral-400">
        <span className="hover:text-zinc-700 dark:hover:text-neutral-200">Dashboard</span>
        <span className="text-zinc-300 dark:text-neutral-600">/</span>
        <span className="text-zinc-900 dark:text-neutral-100">Auth</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-neutral-100">
            Authentication
          </h1>
          <p className="max-w-xl text-[15px] text-zinc-500 dark:text-neutral-400">
            Configure OAuth providers, allowed origins, test users, and magic
            code emails for{' '}
            <span className="font-medium text-zinc-800 dark:text-neutral-200">{APP.title}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 ring-1 ring-zinc-200/70 dark:bg-neutral-900 dark:ring-neutral-800">
          <span className="text-[11px] tracking-wide text-zinc-500 uppercase dark:text-neutral-400">
            App ID
          </span>
          <code className="font-mono text-xs text-zinc-700 dark:text-neutral-300">{APP.id}</code>
          <button
            aria-label="Copy app ID"
            className="text-zinc-400 hover:text-zinc-700 dark:text-neutral-500 dark:hover:text-neutral-200"
          >
            <IconCopy />
          </button>
        </div>
      </div>
    </div>
  );
}

const SUBNAV = [
  { id: 'clients', label: 'Clients' },
  { id: 'origins', label: 'Origins' },
  { id: 'test-users', label: 'Test users' },
  { id: 'email', label: 'Email' },
];

function SubNav({ active }: { active: string }) {
  return (
    <nav className="sticky top-0 z-10 -mx-6 mb-8 border-b border-zinc-200 bg-[#FAFAFA]/90 px-6 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80">
      <ul className="flex items-center gap-6">
        {SUBNAV.map((item) => {
          const isActive = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={cx(
                  'relative inline-block py-3 text-sm transition-colors',
                  isActive
                    ? 'font-medium text-zinc-900 dark:text-neutral-100'
                    : 'text-zinc-500 hover:text-zinc-800 dark:text-neutral-400 dark:hover:text-neutral-200',
                )}
              >
                {item.label}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-indigo-600" />
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function EmptyClientsCard({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex gap-2">
        {(['google', 'apple', 'github', 'clerk'] as ProviderType[]).map((p) => (
          <ProviderTile key={p} provider={p} size="sm" />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold text-zinc-900 dark:text-neutral-100">
          No OAuth clients configured
        </div>
        <p className="max-w-sm text-xs text-zinc-500 dark:text-neutral-400">
          Add a client to enable social login or third-party authentication for
          your app.
        </p>
      </div>
      <Button variant="primary" size="sm" onClick={onAdd}>
        <IconPlus /> Add client
      </Button>
    </div>
  );
}

const PROVIDER_ORDER: ProviderType[] = [
  'google',
  'apple',
  'github',
  'linkedin',
  'clerk',
  'firebase',
];

function ProviderPicker({ onCancel }: { onCancel: () => void }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-neutral-100">
            Select an auth provider
          </div>
          <div className="text-xs text-zinc-500 dark:text-neutral-400">
            Each provider maps to one or more OAuth clients.
          </div>
        </div>
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {PROVIDER_ORDER.map((p) => {
          const cfg = PROVIDERS[p];
          return (
            <button
              key={p}
              className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
            >
              <ProviderTile provider={p} size="sm" />
              <span className="text-sm font-medium text-zinc-900 dark:text-neutral-100">
                {cfg.label}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ClientsSection({
  clients,
  addFlow,
}: {
  clients: ClientEntry[];
  addFlow: AddFlow;
}) {
  const [localAddFlow, setLocalAddFlow] = useState<AddFlow>(addFlow);
  useEffect(() => setLocalAddFlow(addFlow), [addFlow]);

  const providerCount = new Set(clients.map((c) => c.provider)).size;

  return (
    <section id="clients" className="scroll-mt-20">
      <SectionHeader
        eyebrow="Clients"
        title="OAuth clients"
        description="Each client maps one provider and environment (web, iOS, Android). Add per-platform clients so we can issue the right tokens."
        action={
          clients.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setLocalAddFlow('picker')}
            >
              <IconPlus /> Add client
            </Button>
          ) : null
        }
      />
      {clients.length === 0 && localAddFlow !== 'picker' ? (
        <EmptyClientsCard onAdd={() => setLocalAddFlow('picker')} />
      ) : null}
      {clients.length > 0 ? (
        <Card>
          <ul>
            {clients.map((c, i) => (
              <li
                key={c.id}
                className={cx(
                  'flex items-center gap-4 px-5 py-4',
                  i !== clients.length - 1 && 'border-b border-zinc-200/70 dark:border-neutral-800',
                )}
              >
                <ProviderTile provider={c.provider} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-900 dark:text-neutral-100">
                      {c.name}
                    </span>
                    {c.tags?.map((t) => (
                      <Pill key={t.label} tone={t.tone}>
                        {t.label}
                      </Pill>
                    ))}
                  </div>
                  <div className="truncate font-mono text-[12px] text-zinc-500 dark:text-neutral-500">
                    {c.clientId}
                  </div>
                  {c.subtitle && (
                    <div className="truncate text-xs text-zinc-500 dark:text-neutral-500">
                      {c.subtitle}
                    </div>
                  )}
                </div>
                {c.redirect && (
                  <div className="hidden min-w-0 max-w-[28%] flex-col items-end gap-0.5 md:flex">
                    <span className="text-[11px] tracking-wide text-zinc-400 uppercase dark:text-neutral-500">
                      Redirect
                    </span>
                    <span className="truncate font-mono text-xs text-zinc-600 dark:text-neutral-400">
                      {c.redirect}
                    </span>
                  </div>
                )}
                <LinkButton>Edit</LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {localAddFlow === 'picker' ? (
        <div className="mt-4">
          <ProviderPicker onCancel={() => setLocalAddFlow(null)} />
        </div>
      ) : null}
      {clients.length > 0 ? (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500 dark:text-neutral-500">
          <span>
            {clients.length} clients across {providerCount} providers
          </span>
          <a
            href="#"
            className="font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Learn about providers →
          </a>
        </div>
      ) : null}
    </section>
  );
}

function OriginIcon({ kind }: { kind: Origin['kind'] }) {
  const color =
    kind === 'website'
      ? 'text-zinc-500 dark:text-neutral-400'
      : kind === 'vercel'
        ? 'text-zinc-900 dark:text-neutral-200'
        : kind === 'netlify'
          ? 'text-teal-600'
          : 'text-indigo-600';
  const icon =
    kind === 'website' ? (
      <IconGlobe />
    ) : kind === 'vercel' ? (
      <IconTriangle />
    ) : kind === 'netlify' ? (
      <IconDot />
    ) : (
      <IconMobile />
    );
  return (
    <div className={cx('flex h-6 w-6 items-center justify-center', color)}>
      {icon}
    </div>
  );
}

function OriginsSection({ origins }: { origins: Origin[] }) {
  const [showAdd, setShowAdd] = useState(false);
  useEffect(() => setShowAdd(false), [origins]);
  const originLabel: Record<Origin['kind'], string> = {
    website: 'Website',
    vercel: 'Vercel preview',
    netlify: 'Netlify preview',
    scheme: 'App scheme',
  };
  return (
    <section id="origins" className="scroll-mt-20">
      <SectionHeader
        eyebrow="Origins"
        title="Redirect origins"
        description="URLs that Instant will accept as OAuth redirect targets. Add every domain your app is served from."
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAdd((v) => !v)}
          >
            <IconPlus /> Add origin
          </Button>
        }
      />
      {origins.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <div className="text-sm font-semibold text-zinc-900 dark:text-neutral-100">
            No origins yet
          </div>
          <p className="max-w-sm text-xs text-zinc-500 dark:text-neutral-400">
            Add your site's URL so you can initiate the OAuth flow from your
            site.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
            <IconPlus /> Add origin
          </Button>
        </div>
      ) : (
        <Card>
          {showAdd && (
            <div className="flex items-end gap-3 border-b border-zinc-200/70 bg-zinc-50/60 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="w-44">
                <Select label="Type">
                  <option>Website</option>
                  <option>Vercel preview</option>
                  <option>Netlify preview</option>
                  <option>App scheme</option>
                </Select>
              </div>
              <div className="flex-1">
                <TextInput
                  label="Value"
                  placeholder="https://yoursite.com"
                  defaultValue=""
                />
              </div>
              <Button variant="primary" size="md">
                Add origin
              </Button>
              <Button size="md" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          )}
          {origins.length > 0 ? (
            <>
              <div className="grid grid-cols-[28px_140px_1fr_32px] items-center gap-3 border-b border-zinc-200/70 bg-zinc-50/60 px-5 py-2.5 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
                <span />
                <span>Type</span>
                <span>Value</span>
                <span />
              </div>
              <ul>
                {origins.map((o, i) => (
                  <li
                    key={o.id}
                    className={cx(
                      'grid grid-cols-[28px_140px_1fr_32px] items-center gap-3 px-5 py-3.5',
                      i !== origins.length - 1 && 'border-b border-zinc-200/70 dark:border-neutral-800',
                    )}
                  >
                    <OriginIcon kind={o.kind} />
                    <div className="text-sm text-zinc-800 dark:text-neutral-200">
                      {originLabel[o.kind]}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-mono text-[13px] text-zinc-900 dark:text-neutral-100">
                        {o.value}
                      </span>
                      {o.detail && (
                        <span className="truncate text-xs text-zinc-500 dark:text-neutral-500">
                          {o.detail}
                        </span>
                      )}
                    </div>
                    <button
                      aria-label="Delete origin"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-rose-400"
                    >
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      )}
    </section>
  );
}

function TestUsersSection({ users }: { users: TestUser[] }) {
  const [showAdd, setShowAdd] = useState(false);
  useEffect(() => setShowAdd(false), [users]);
  return (
    <section id="test-users" className="scroll-mt-20">
      <SectionHeader
        eyebrow="Test users"
        title="Test users"
        description="Static magic codes for development, automated tests, and app store review. These never expire and bypass email delivery."
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowAdd((v) => !v)}
          >
            <IconPlus /> Add test user
          </Button>
        }
      />
      {users.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <div className="text-sm font-semibold text-zinc-900 dark:text-neutral-100">
            No test users
          </div>
          <p className="max-w-sm text-xs text-zinc-500 dark:text-neutral-400">
            Add a test user to bypass magic code emails during development or
            app store review.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
            <IconPlus /> Add test user
          </Button>
        </div>
      ) : (
        <Card>
          <div className="grid grid-cols-[1fr_140px_140px_32px] items-center gap-3 border-b border-zinc-200/70 bg-zinc-50/60 px-5 py-2.5 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
            <span>Email</span>
            <span>Code</span>
            <span>Created</span>
            <span />
          </div>
          {showAdd && (
            <div className="grid grid-cols-[1fr_140px_140px_auto] items-end gap-3 border-b border-zinc-200/70 bg-zinc-50/60 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <TextInput
                label="Email"
                placeholder="test@example.com"
                defaultValue=""
              />
              <TextInput label="Code" defaultValue="424242" />
              <div className="text-xs text-zinc-500 dark:text-neutral-500">Auto-generated</div>
              <div className="flex items-center gap-2">
                <Button variant="primary" size="md">
                  Save
                </Button>
                <Button size="md" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <ul>
            {users.map((u, i) => (
              <li
                key={u.id}
                className={cx(
                  'grid grid-cols-[1fr_140px_140px_32px] items-center gap-3 px-5 py-3.5',
                  i !== users.length - 1 && 'border-b border-zinc-200/70 dark:border-neutral-800',
                )}
              >
                <div className="truncate text-sm text-zinc-900 dark:text-neutral-100">{u.email}</div>
                <div className="font-mono text-sm text-zinc-900 dark:text-neutral-100">{u.code}</div>
                <div className="text-sm text-zinc-500 dark:text-neutral-500">{u.created}</div>
                <button
                  aria-label="Delete user"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-rose-400"
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

function EmailPreview() {
  return (
    <div className="overflow-hidden rounded-md ring-1 ring-zinc-200/70 dark:ring-neutral-800">
      <div className="flex flex-col gap-1 border-b border-zinc-200/70 bg-zinc-50/60 px-4 py-3 text-xs dark:border-neutral-800 dark:bg-neutral-800/40">
        <div className="flex items-center gap-2 text-zinc-500 dark:text-neutral-400">
          <span className="w-12 text-zinc-400 dark:text-neutral-500">From</span>
          <span className="text-zinc-800 dark:text-neutral-200">
            Instant Show HN{' '}
            <span className="font-mono text-zinc-500 dark:text-neutral-400">
              &lt;hi@yourdomain.co&gt;
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 dark:text-neutral-400">
          <span className="w-12 text-zinc-400 dark:text-neutral-500">To</span>
          <span className="font-mono text-zinc-800 dark:text-neutral-200">
            happyuser@gmail.com
          </span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 dark:text-neutral-400">
          <span className="w-12 text-zinc-400 dark:text-neutral-500">Subj</span>
          <span className="text-zinc-800 dark:text-neutral-200">
            424242 is your code for instant show hn
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-4 bg-[#f6f6f6] px-6 py-8 dark:bg-neutral-800">
        <div className="w-full max-w-sm rounded-sm bg-white px-5 py-6 text-sm text-zinc-800 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          <p className="mb-3 font-semibold">Welcome,</p>
          <p className="mb-4">
            You asked to join{' '}
            <span className="font-semibold">instant show hn</span>. To complete
            your registration, use this verification code:
          </p>
          <div className="text-center text-2xl font-bold tracking-[0.25em] text-zinc-900">
            424242
          </div>
        </div>
      </div>
    </div>
  );
}

function VerificationCallout({ confirmed }: { confirmed: boolean }) {
  if (confirmed) {
    return (
      <div className="flex items-start gap-3 rounded-md border-l-4 border-emerald-500 bg-emerald-50/70 p-4 ring-1 ring-emerald-200/60 dark:bg-emerald-950/30 dark:ring-emerald-900/60">
        <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
          <IconCheck />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              Sender verified
            </div>
            <Pill tone="green">Confirmed</Pill>
          </div>
          <div className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Emails are being sent from{' '}
            <span className="font-mono">hi@yourdomain.co</span>. Domain DNS is
            green.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-md border-l-4 border-amber-500 bg-amber-50/70 p-4 ring-1 ring-amber-200/60 dark:bg-amber-950/30 dark:ring-amber-900/60">
      <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white">
        <span className="text-[11px] font-bold">!</span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Awaiting confirmation
          </div>
          <Pill tone="amber">Pending</Pill>
        </div>
        <div className="text-xs text-amber-800/80 dark:text-amber-300/80">
          We've sent a confirmation email to{' '}
          <span className="font-mono">hi@yourdomain.co</span>. Click the link
          inside to verify ownership.
        </div>
      </div>
    </div>
  );
}

function DnsTable() {
  const rows = [
    {
      record: 'DKIM',
      type: 'TXT',
      host: '20240101._domainkey.yourdomain.co',
      value: 'k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUA...',
    },
    {
      record: 'Return-Path',
      type: 'CNAME',
      host: 'pm-bounces.yourdomain.co',
      value: 'pm.mtasv.net',
    },
  ];
  return (
    <div className="overflow-hidden rounded-md ring-1 ring-zinc-200/70 dark:ring-neutral-800">
      <div className="grid grid-cols-[90px_64px_1fr_24px] gap-3 border-b border-zinc-200/70 bg-zinc-50/60 px-4 py-2.5 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
        <span>Record</span>
        <span>Type</span>
        <span>Value</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div
          key={r.record}
          className={cx(
            'grid grid-cols-[90px_64px_1fr_24px] gap-3 px-4 py-3 text-xs',
            i !== rows.length - 1 && 'border-b border-zinc-200/70 dark:border-neutral-800',
          )}
        >
          <div className="text-zinc-800 dark:text-neutral-200">{r.record}</div>
          <div className="text-zinc-500 dark:text-neutral-500">{r.type}</div>
          <div className="flex flex-col gap-1">
            <code className="block truncate font-mono text-[11.5px] text-zinc-800 dark:text-neutral-200">
              {r.host}
            </code>
            <code className="block truncate rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-neutral-800 dark:text-neutral-300">
              {r.value}
            </code>
          </div>
          <button
            aria-label="Copy"
            className="flex h-6 w-6 items-center justify-center text-zinc-400 hover:text-zinc-700 dark:text-neutral-500 dark:hover:text-neutral-200"
          >
            <IconCopy />
          </button>
        </div>
      ))}
    </div>
  );
}

function EmailSection({ state }: { state: EmailState }) {
  if (state === 'collapsed') {
    return (
      <section id="email" className="scroll-mt-20">
        <SectionHeader
          eyebrow="Email"
          title="Magic code email"
          description="Customize the email that users receive when they request a magic code."
        />
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-zinc-300 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="text-sm text-zinc-600 dark:text-neutral-400">
            You're using the default magic code email. Customize it to match
            your brand.
          </div>
          <Button variant="secondary" size="sm">
            Customize magic code email
          </Button>
        </div>
      </section>
    );
  }

  const confirmed = state === 'confirmed';

  return (
    <section id="email" className="scroll-mt-20">
      <SectionHeader
        eyebrow="Email"
        title="Magic code email"
        description="Customize the email that users receive when they request a magic code. Variables are rendered at send time."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        {/* Form */}
        <Card className="p-5">
          <div className="flex flex-col gap-4">
            <TextInput
              label="Subject"
              defaultValue="{code} is your code for {app_title}"
            />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="From name" defaultValue="Instant Show HN" />
              <TextInput label="Reply-to" defaultValue="hi@yourdomain.co" />
            </div>
            <TextArea
              label="HTML body"
              mono
              rows={11}
              defaultValue={EMAIL_BODY}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-neutral-500">
              Available variables:
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-neutral-800 dark:text-neutral-300">
                {'{code}'}
              </code>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-neutral-800 dark:text-neutral-300">
                {'{app_title}'}
              </code>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-neutral-800 dark:text-neutral-300">
                {'{user_email}'}
              </code>
            </div>
            <Divider className="my-1" />
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-neutral-100">
                  Custom sender
                </div>
                <div className="text-xs text-zinc-500 dark:text-neutral-400">
                  Send from your own domain to improve trust and deliverability.
                </div>
              </div>
              <TextInput
                label="Sender email"
                defaultValue="hi@yourdomain.co"
              />
              <VerificationCallout confirmed={confirmed} />
              <div>
                <div className="mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-neutral-400">
                  DNS records
                </div>
                <DnsTable />
              </div>
            </div>
            <Divider className="my-1" />
            <div className="flex items-center justify-between gap-3">
              <div className="w-52">
                <Select label="Magic code expiry">
                  <option>10 minutes</option>
                  <option>60 minutes</option>
                  <option>1440 minutes (24h)</option>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="danger">Delete template</Button>
                <Button variant="primary">Save changes</Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Preview */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-neutral-400">
              Preview
            </div>
            <Pill tone="indigo">Rendered</Pill>
          </div>
          <EmailPreview />
          <Card className="p-4">
            <div className="mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-neutral-400">
              Summary
            </div>
            <KeyValue label="Template" value="Custom" />
            <KeyValue label="Sender" value="hi@yourdomain.co" />
            <KeyValue label="Expiry" value="10 min" />
            <KeyValue
              label="DKIM"
              value={
                confirmed ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                    <IconCheck /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                    Pending
                  </span>
                )
              }
            />
          </Card>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dashboard chrome (top bar + sidebar + app header)
// ---------------------------------------------------------------------------

function PillButton({ children }: { children: ReactNode }) {
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
          <InstantButton size="mini" variant="primary">
            <PlusIcon height={14} /> New app
          </InstantButton>
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
            {APP.title}
          </h2>
        </div>
        <SmallCopyable size="normal" label="Public App ID" value={APP.id} />
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
// Auth content (Stripe-clean) rendered from a snapshot
// ---------------------------------------------------------------------------

function AuthContent({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className="min-h-full w-full bg-zinc-50 text-zinc-900 dark:bg-neutral-900 dark:text-neutral-100">
      <main className="mx-auto w-full max-w-4xl px-6 pb-24">
        <PageHeader />
        <SubNav active="clients" />
        <div className="flex flex-col gap-14">
          <ClientsSection clients={snapshot.clients} addFlow={snapshot.addFlow} />
          <Divider />
          <OriginsSection origins={snapshot.origins} />
          <Divider />
          <TestUsersSection users={snapshot.testUsers} />
          <Divider />
          <EmailSection state={snapshot.email} />
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AuthUIV2Page() {
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
        <title>Auth · {APP.title}</title>
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
              <AuthContent snapshot={snapshot} />
            </div>
          </div>
        </div>
        <div className="fixed top-16 right-4 z-50 flex items-center gap-2 rounded-md bg-white/95 px-3 py-2 shadow-md ring-1 ring-zinc-200/70 backdrop-blur dark:bg-neutral-900/95 dark:ring-neutral-800">
          <button
            onClick={prev}
            aria-label="Previous state"
            className="cursor-pointer rounded-md px-2 py-1 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-neutral-200 dark:ring-neutral-700 dark:hover:bg-neutral-800"
          >
            ←
          </button>
          <select
            value={snapshot.id}
            onChange={(e) =>
              setIdx(SNAPSHOTS.findIndex((s) => s.id === e.target.value))
            }
            className="max-w-[18rem] cursor-pointer rounded-md bg-white px-2 py-1 text-xs text-zinc-800 ring-1 ring-inset ring-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-700"
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
            className="cursor-pointer rounded-md px-2 py-1 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-neutral-200 dark:ring-neutral-700 dark:hover:bg-neutral-800"
          >
            →
          </button>
        </div>
      </div>
    </TokenContext.Provider>
  );
}

export default asClientOnlyPage(AuthUIV2Page);

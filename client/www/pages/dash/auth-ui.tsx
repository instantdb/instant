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
  Button,
  cn,
  Content,
  Divider,
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

import {
  Client as GoogleClient,
  AddClientForm as AddGoogleClientForm,
} from '@/components/dash/auth/Google';
import {
  AppleClient,
  AddClientExpanded as AddAppleClientForm,
} from '@/components/dash/auth/Apple';
import {
  Client as GitHubClient,
  AddClientForm as AddGitHubClientForm,
} from '@/components/dash/auth/GitHub';
import {
  Client as LinkedInClient,
  AddClientForm as AddLinkedInClientForm,
} from '@/components/dash/auth/LinkedIn';
import {
  ClerkClient,
  AddClerkClientForm,
} from '@/components/dash/auth/Clerk';
import {
  FirebaseClient,
  AddFirebaseClientForm,
} from '@/components/dash/auth/Firebase';
import {
  AuthorizedOriginRow,
  AuthorizedOriginsForm,
} from '@/components/dash/auth/Origins';

import googleIconSvg from '../../public/img/google_g.svg';
import appleIconSvg from '../../public/img/apple_logo_black.svg';
import githubIconSvg from '../../public/img/github.svg';
import linkedinIconSvg from '../../public/img/linkedin.svg';
import clerkIconSvg from '../../public/img/clerk_logo_black.svg';
import firebaseIconSvg from '../../public/img/firebase_auth.svg';

// ---------------------------------------------------------------------------
// Mock data
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

const linkedinClient: OAuthClient = {
  id: 'c-linkedin',
  client_name: 'linkedin-web',
  client_id: '77abcdefgh12',
  provider_id: PROVIDERS.linkedin.id,
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

const firebaseClient: OAuthClient = {
  id: 'c-firebase',
  client_name: 'firebase',
  client_id: 'firebase-id',
  provider_id: PROVIDERS.firebase.id,
  discovery_endpoint:
    'https://securetoken.google.com/my-firebase-project/.well-known/openid-configuration',
  meta: {},
};

const ORIGINS_FULL: AuthorizedOrigin[] = [
  { id: 'o-web', service: 'generic', params: ['yoursite.com'] },
  { id: 'o-vercel', service: 'vercel', params: ['vercel.app', 'my-project'] },
  { id: 'o-netlify', service: 'netlify', params: ['my-site'] },
  { id: 'o-custom', service: 'custom-scheme', params: ['myapp'] },
];

type TestUser = { id: string; email: string; code: string };

const TEST_USERS_FULL: TestUser[] = [
  { id: 't1', email: 'alice@example.com', code: '424242' },
  { id: 't2', email: 'appstore-review@example.com', code: '123456' },
];

// ---------------------------------------------------------------------------
// Lightweight mocks for components that fetch their own data
// ---------------------------------------------------------------------------

function MockTestUsers({
  users,
  showAddForm,
}: {
  users: TestUser[];
  showAddForm: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionHeading>Test Users</SectionHeading>
      <Content>
        Test users have static magic codes that never expire. When a test user
        signs in, they can use their static code instead of receiving an email.
        This is useful for development, automated testing, and app store review.
      </Content>
      {users.length > 0 && (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded border p-3 dark:border-neutral-700"
            >
              <div className="flex flex-col gap-0.5">
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-neutral-400">
                    Email:{' '}
                  </span>
                  <span className="font-medium dark:text-white">{u.email}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-neutral-400">
                    Code:{' '}
                  </span>
                  <span className="font-mono font-semibold dark:text-white">
                    {u.code}
                  </span>
                </div>
              </div>
              <button
                aria-label="Remove user"
                className="cursor-pointer text-gray-400 hover:text-red-500 dark:text-neutral-500"
              >
                <TrashIcon height="1rem" />
              </button>
            </div>
          ))}
        </div>
      )}
      {showAddForm ? (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <TextInput
              label="Email"
              placeholder="test@example.com"
              value=""
              onChange={() => {}}
            />
          </div>
          <div className="w-36">
            <TextInput
              label="Magic code"
              placeholder="123456"
              value="424242"
              onChange={() => {}}
            />
          </div>
          <div className="pt-6">
            <Button variant="primary">Add</Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary">Add a test user</Button>
        </div>
      )}
    </div>
  );
}

type EmailState = 'collapsed' | 'no-sender' | 'pending' | 'confirmed';

const defaultBody = `<div style="background: #f6f6f6; font-family: Helvetica, Arial, sans-serif; line-height: 1.6; font-size: 18px;">
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
    <span className="rounded-sm border bg-white px-1 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">
      {'{'}
      {children}
      {'}'}
    </span>
  );
}

function StatusCircle({ isSuccess }: { isSuccess: boolean }) {
  if (isSuccess) {
    return (
      <div className="flex h-3 w-3 items-center justify-center rounded-full bg-green-500">
        <span className="text-xs text-white">✓</span>
      </div>
    );
  }
  return <div className="h-3 w-3 rounded-full bg-red-500"></div>;
}

function MockEmail({ state }: { state: EmailState }) {
  if (state === 'collapsed') {
    return (
      <div className="flex flex-col gap-2">
        <SectionHeading>Custom Magic Code Email</SectionHeading>
        <Button>Customize your magic code email</Button>
      </div>
    );
  }
  const showVerification = state === 'pending' || state === 'confirmed';
  const confirmed = state === 'confirmed';
  return (
    <div className="flex flex-col gap-2">
      <SectionHeading>Custom Magic Code Email</SectionHeading>
      <div className="flex flex-col gap-1 rounded-sm border bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="text-sm font-semibold dark:text-white">
          Template variables
        </div>
        <Content className="text-sm">
          We provide a few dynamic variables for you to use in your email:
          <ul>
            <li>
              <VariableName>code</VariableName>, the magic code e.g.{' '}
              <strong className="dark:text-white">123456</strong>
            </li>
            <li>
              <VariableName>app_title</VariableName>, your app's title, i.e.{' '}
              <strong className="dark:text-white">{MOCK_APP.title}</strong>
            </li>
            <li>
              <VariableName>user_email</VariableName>, the user's email address,
              e.g.{' '}
              <strong className="dark:text-white">happyuser@gmail.com</strong>
            </li>
          </ul>
        </Content>
      </div>
      <TextInput
        label="Subject"
        value="{code} is your code for {app_title}"
        onChange={() => {}}
      />
      <TextInput
        label="From"
        value="Instant Show HN"
        onChange={() => {}}
      />
      <div className="flex flex-col gap-1">
        <Label>Body (HTML or plain-text)</Label>
        <TextArea value={defaultBody} onChange={() => {}} rows={10} />
      </div>
      <div className="flex flex-col gap-2 rounded-sm border bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
        <SubsectionHeading>
          Use a custom 'From' address (optional)
        </SubsectionHeading>
        <Content className="text-sm">
          By default emails are sent from our domain. Add a custom sender to
          send emails from your own domain and build trust with recipients.
        </Content>
        <TextInput
          label="Sender email address"
          placeholder="hi@yourdomain.co"
          value={showVerification ? 'hi@yourdomain.co' : ''}
          onChange={() => {}}
        />
      </div>
      {showVerification && (
        <div className="flex flex-col gap-2 rounded-sm border bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
          <div className="flex items-center justify-between">
            <SubsectionHeading>Verify hi@yourdomain.co</SubsectionHeading>
            <Button variant="primary" size="mini">
              Refresh Status
            </Button>
          </div>
          <div className="rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-700/60">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium dark:text-white">
                Email Confirmation
              </div>
              <div className="flex items-center gap-2">
                <StatusCircle isSuccess={confirmed} />
                {confirmed ? (
                  <div className="text-xs font-medium text-green-600">
                    Confirmed
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-neutral-400">
                    Pending confirmation
                  </div>
                )}
              </div>
            </div>
            <Content className="text-sm text-gray-600 dark:text-neutral-400">
              {confirmed
                ? `Great! You've confirmed hi@yourdomain.co and can now send emails from this address.`
                : `We've sent a confirmation email to hi@yourdomain.co. Please click the link in that email to confirm ownership.`}
            </Content>
          </div>
          <div className="rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-700/60">
            <div className="mb-2 text-sm font-medium dark:text-white">
              Bonus: Domain Verification
            </div>
            <Content className="mb-3 text-sm text-gray-600 dark:text-neutral-400">
              Add DNS records to improve email deliverability and avoid spam
              filters.
            </Content>
            <div className="mb-3 overflow-hidden rounded-sm border dark:border-neutral-600">
              <div className="grid grid-cols-[1fr_80px_2fr] border-b bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 dark:border-b-neutral-600 dark:bg-neutral-600/50 dark:text-white">
                <div>Record</div>
                <div>Type</div>
                <div>Value</div>
              </div>
              <div className="grid grid-cols-[1fr_80px_2fr] border-b px-4 py-3 text-sm dark:border-b-neutral-600 dark:text-white">
                <div className="font-medium">DKIM</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  TXT
                </div>
                <div className="flex flex-col gap-2">
                  <code className="block rounded-sm bg-gray-100 px-2 py-1 text-xs break-all select-all dark:bg-neutral-700">
                    20240101._domainkey.yourdomain.co
                  </code>
                  <code className="block rounded-sm bg-gray-100 px-2 py-1 text-xs break-all select-all dark:bg-neutral-700">
                    k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUA...
                  </code>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_80px_2fr] px-4 py-3 text-sm dark:text-white">
                <div className="font-medium">Return-Path</div>
                <div className="text-sm text-gray-600 dark:text-neutral-400">
                  CNAME
                </div>
                <div className="flex flex-col gap-2">
                  <code className="block rounded-sm bg-gray-100 px-2 py-1 text-xs break-all select-all dark:bg-neutral-700">
                    pm-bounces.yourdomain.co
                  </code>
                  <code className="block rounded-sm bg-gray-100 px-2 py-1 text-xs break-all select-all dark:bg-neutral-700">
                    pm.mtasv.net
                  </code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <Button>Save</Button>
      <Button variant="destructive">Delete template</Button>
      <div className="mt-4">
        <button className="text-sm text-gray-400 underline hover:text-gray-600 dark:text-neutral-500">
          Change magic code expiration
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline provider picker (matches the one inside AppAuth)
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
  { label: string; icon: any; darkInvert?: boolean }
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

function ProviderPicker() {
  return (
    <div className="flex flex-col gap-4 rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <SubsectionHeading>Select auth provider</SubsectionHeading>
      <div className="grid grid-cols-3 gap-2">
        {PROVIDER_ORDER.map((p) => {
          const cfg = PROVIDER_UI[p];
          return (
            <button
              key={p}
              className="flex cursor-pointer flex-col items-center gap-2 rounded border p-4 transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-700"
            >
              <Image
                alt={`${cfg.label} icon`}
                src={cfg.icon}
                width={24}
                height={24}
                className={cfg.darkInvert ? 'dark:invert' : ''}
              />
              <span className="text-sm dark:text-white">{cfg.label}</span>
            </button>
          );
        })}
      </div>
      <Button variant="secondary">Cancel</Button>
    </div>
  );
}

function EmptyClientsCard() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-sm border border-dashed bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex gap-2">
        {PROVIDER_ORDER.slice(0, 4).map((p) => {
          const cfg = PROVIDER_UI[p];
          return (
            <Image
              key={p}
              alt={`${cfg.label} icon`}
              src={cfg.icon}
              width={20}
              height={20}
              className={
                cfg.darkInvert
                  ? 'opacity-40 dark:opacity-80 dark:invert'
                  : 'opacity-40 dark:opacity-80'
              }
            />
          );
        })}
      </div>
      <div className="flex flex-col gap-1">
        <div className="dark:text-white">
          <strong>No OAuth clients configured</strong>
        </div>
        <Content>
          Add an auth client to enable social login or third-party
          authentication for your app.
        </Content>
      </div>
      <Button variant="secondary">
        <PlusIcon height={14} /> Add client
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page-level state snapshots
// ---------------------------------------------------------------------------

type AddFlow =
  | null
  | 'picker'
  | 'form-google'
  | 'form-apple'
  | 'form-github'
  | 'form-linkedin'
  | 'form-clerk'
  | 'form-firebase';

type Snapshot = {
  id: string;
  label: string;
  clients: OAuthClient[];
  origins: AuthorizedOrigin[];
  testUsers: TestUser[];
  testUsersShowAddForm: boolean;
  email: EmailState;
  addFlow: AddFlow;
  // Which existing client should be expanded (for highlighting a specific state)
  expandedClientId?: string;
};

const SNAPSHOTS: Snapshot[] = [
  {
    id: 'fresh',
    label: 'Fresh app (empty)',
    clients: [],
    origins: [],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: null,
  },
  {
    id: 'picker',
    label: 'Add client → picker',
    clients: [],
    origins: [],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: 'picker',
  },
  {
    id: 'add-google',
    label: 'Add client → Google form',
    clients: [],
    origins: [],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: 'form-google',
  },
  {
    id: 'add-apple',
    label: 'Add client → Apple form',
    clients: [],
    origins: [],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: 'form-apple',
  },
  {
    id: 'add-clerk',
    label: 'Add client → Clerk form',
    clients: [],
    origins: [],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: 'form-clerk',
  },
  {
    id: 'google-shared',
    label: 'Google (shared dev creds)',
    clients: [googleSharedClient],
    origins: [],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: null,
    expandedClientId: googleSharedClient.id,
  },
  {
    id: 'google-custom',
    label: 'Google (custom creds + redirect)',
    clients: [googleCustomClient],
    origins: [{ id: 'o-web', service: 'generic', params: ['yoursite.com'] }],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: null,
    expandedClientId: googleCustomClient.id,
  },
  {
    id: 'all-providers',
    label: 'One of every provider',
    clients: [
      googleCustomClient,
      appleClient,
      githubClient,
      linkedinClient,
      clerkClient,
      firebaseClient,
    ],
    origins: [{ id: 'o-web', service: 'generic', params: ['yoursite.com'] }],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: null,
  },
  {
    id: 'origins-full',
    label: 'Origins (website/vercel/netlify/native)',
    clients: [googleCustomClient],
    origins: ORIGINS_FULL,
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: null,
  },
  {
    id: 'test-users',
    label: 'Test users populated',
    clients: [googleCustomClient],
    origins: [{ id: 'o-web', service: 'generic', params: ['yoursite.com'] }],
    testUsers: TEST_USERS_FULL,
    testUsersShowAddForm: false,
    email: 'collapsed',
    addFlow: null,
  },
  {
    id: 'test-users-add',
    label: 'Test users → add form',
    clients: [googleCustomClient],
    origins: [],
    testUsers: TEST_USERS_FULL,
    testUsersShowAddForm: true,
    email: 'collapsed',
    addFlow: null,
  },
  {
    id: 'email-no-sender',
    label: 'Email template (editing, no sender)',
    clients: [googleCustomClient],
    origins: [],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'no-sender',
    addFlow: null,
  },
  {
    id: 'email-pending',
    label: 'Email template (sender PENDING)',
    clients: [googleCustomClient],
    origins: [],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'pending',
    addFlow: null,
  },
  {
    id: 'email-confirmed',
    label: 'Email template (sender CONFIRMED)',
    clients: [googleCustomClient],
    origins: [],
    testUsers: [],
    testUsersShowAddForm: false,
    email: 'confirmed',
    addFlow: null,
  },
  {
    id: 'full-production',
    label: 'Full production setup',
    clients: [
      googleCustomClient,
      googleIosClient,
      appleClient,
      githubClient,
      clerkClient,
    ],
    origins: ORIGINS_FULL,
    testUsers: TEST_USERS_FULL,
    testUsersShowAddForm: false,
    email: 'confirmed',
    addFlow: null,
  },
];

const noop = () => {};

function ClientRow({
  client,
  defaultOpen,
}: {
  client: OAuthClient;
  defaultOpen: boolean;
}) {
  const providerId = client.provider_id;
  const providerName =
    Object.values(PROVIDERS).find((p) => p.id === providerId)?.provider_name ??
    'unknown';
  const key = `${client.id}-${defaultOpen ? 'open' : 'closed'}`;
  switch (providerName) {
    case 'google':
      return (
        <GoogleClient
          key={key}
          app={MOCK_APP}
          client={client}
          onUpdateClient={noop}
          onDeleteClient={noop}
          defaultOpen={defaultOpen}
        />
      );
    case 'apple':
      return (
        <AppleClient
          key={key}
          app={MOCK_APP}
          client={client}
          onDeleteClient={noop}
          defaultOpen={defaultOpen}
        />
      );
    case 'github':
      return (
        <GitHubClient
          key={key}
          app={MOCK_APP}
          client={client}
          onUpdateClient={noop}
          onDeleteClient={noop}
          defaultOpen={defaultOpen}
        />
      );
    case 'linkedin':
      return (
        <LinkedInClient
          key={key}
          app={MOCK_APP}
          client={client}
          onUpdateClient={noop}
          onDeleteClient={noop}
          defaultOpen={defaultOpen}
        />
      );
    case 'clerk':
      return (
        <ClerkClient
          key={key}
          app={MOCK_APP}
          client={client}
          onUpdateClient={noop}
          onDeleteClient={noop}
          defaultOpen={defaultOpen}
        />
      );
    case 'firebase':
      return (
        <FirebaseClient
          key={key}
          app={MOCK_APP}
          client={client}
          onDeleteClient={noop}
          defaultOpen={defaultOpen}
        />
      );
    default:
      return null;
  }
}

function AddClientArea({ addFlow }: { addFlow: AddFlow }) {
  const usedNames = new Set<string>();
  if (addFlow === null) {
    return (
      <Button variant="secondary">
        <PlusIcon height={14} /> Add client
      </Button>
    );
  }
  if (addFlow === 'picker') {
    return <ProviderPicker />;
  }
  if (addFlow === 'form-google') {
    return (
      <AddGoogleClientForm
        app={MOCK_APP}
        provider={PROVIDERS.google}
        onAddClient={noop}
        onCancel={noop}
        usedClientNames={usedNames}
      />
    );
  }
  if (addFlow === 'form-apple') {
    return (
      <AddAppleClientForm
        app={MOCK_APP}
        provider={PROVIDERS.apple}
        onAddProvider={noop}
        onAddClient={noop}
        onCancel={noop}
        usedClientNames={usedNames}
      />
    );
  }
  if (addFlow === 'form-github') {
    return (
      <AddGitHubClientForm
        app={MOCK_APP}
        provider={PROVIDERS.github}
        onAddClient={noop}
        onCancel={noop}
        usedClientNames={usedNames}
      />
    );
  }
  if (addFlow === 'form-linkedin') {
    return (
      <AddLinkedInClientForm
        app={MOCK_APP}
        provider={PROVIDERS.linkedin}
        onAddClient={noop}
        onCancel={noop}
        usedClientNames={usedNames}
      />
    );
  }
  if (addFlow === 'form-clerk') {
    return (
      <AddClerkClientForm
        app={MOCK_APP}
        provider={PROVIDERS.clerk}
        onAddClient={noop}
        onCancel={noop}
        usedClientNames={usedNames}
      />
    );
  }
  if (addFlow === 'form-firebase') {
    return (
      <AddFirebaseClientForm
        app={MOCK_APP}
        provider={PROVIDERS.firebase}
        onAddClient={noop}
        onCancel={noop}
        usedClientNames={usedNames}
      />
    );
  }
  return null;
}

function OriginsSection({
  origins,
}: {
  origins: AuthorizedOrigin[];
}) {
  const [showForm, setShowForm] = useState(origins.length === 0);
  // Reset whenever the list of origins changes (state switch)
  useEffect(() => {
    setShowForm(origins.length === 0);
  }, [origins]);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <SectionHeading>Redirect Origins</SectionHeading>
        <Content className="text-sm text-gray-500 dark:text-neutral-500">
          Add your site's url so that you can initiate the OAuth flow from your
          site.
        </Content>
      </div>
      {showForm ? null : (
        <Button variant="secondary" onClick={() => setShowForm(true)}>
          <PlusIcon height={14} /> Add an origin
        </Button>
      )}
      {showForm ? (
        <AuthorizedOriginsForm
          app={MOCK_APP}
          onAddOrigin={noop}
          onCancel={() => setShowForm(false)}
        />
      ) : null}
      {origins.map((o) => (
        <AuthorizedOriginRow
          key={o.id}
          app={MOCK_APP}
          origin={o}
          onRemoveOrigin={noop}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The auth page rendered from a snapshot
// ---------------------------------------------------------------------------

function AuthPagePreview({ snapshot }: { snapshot: Snapshot }) {
  const { clients, origins, testUsers, testUsersShowAddForm, email, addFlow } =
    snapshot;
  const hasClients = clients.length > 0;

  return (
    <div className="flex max-w-xl flex-col gap-6 p-4">
      <div className="flex flex-col gap-4">
        <SectionHeading>Auth Clients</SectionHeading>
        {!hasClients && addFlow === null ? (
          <EmptyClientsCard />
        ) : null}
        {hasClients ? (
          <div className="flex flex-col gap-2">
            {clients.map((c) => (
              <ClientRow
                key={c.id}
                client={c}
                defaultOpen={c.id === snapshot.expandedClientId}
              />
            ))}
          </div>
        ) : null}
        {hasClients || addFlow !== null ? (
          <AddClientArea addFlow={addFlow} />
        ) : null}
      </div>

      <Divider />

      <OriginsSection origins={origins} />

      <Divider />

      <MockTestUsers users={testUsers} showAddForm={testUsersShowAddForm} />

      <Divider />

      <MockEmail state={email} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell + floating state cycler
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Static recreation of the dash chrome (top bar + sidebar + app header)
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
// Page
// ---------------------------------------------------------------------------

function AuthUIPage() {
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
        <title>Auth UI showcase</title>
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
              <AuthPagePreview snapshot={snapshot} />
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

export default asClientOnlyPage(AuthUIPage);

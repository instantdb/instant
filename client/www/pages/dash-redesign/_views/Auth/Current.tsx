import { useContext, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { PlusIcon } from '@heroicons/react/24/solid';

import { Button, Content, SectionHeading } from '@/components/ui';
import config from '@/lib/config';
import { useAuthedFetch } from '@/lib/auth';
import { TokenContext } from '@/lib/contexts';
import { errorToast } from '@/lib/toast';
import { messageFromInstantError } from '@/lib/errors';
import { InstantIssue } from '@instantdb/core';
import {
  AppsAuthResponse,
  AuthorizedOrigin,
  InstantApp,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';

import { ErrorMessage, Loading } from '@/components/dash/shared';
import {
  AppleClient,
  AddClientExpanded as AddAppleClientForm,
} from '@/components/dash/auth/Apple';
import { ClerkClient, AddClerkClientForm } from '@/components/dash/auth/Clerk';
import { Email } from '@/components/dash/auth/Email';
import { TestUsers } from '@/components/dash/auth/TestUsers';
import {
  GitHubClient,
  AddGitHubClientForm,
} from '@/components/dash/auth/GitHub';
import {
  GoogleClient,
  AddGoogleClientForm,
} from '@/components/dash/auth/Google';
import {
  LinkedInClient,
  AddLinkedInClientForm,
} from '@/components/dash/auth/LinkedIn';
import { AuthorizedOrigins } from '@/components/dash/auth/Origins';
import {
  FirebaseClient,
  AddFirebaseClientForm,
} from '@/components/dash/auth/Firebase';
import { addProvider } from '@/components/dash/auth/shared';

import googleIconSvg from '../../../../public/img/google_g.svg';
import appleLogoSvg from '../../../../public/img/apple_logo_black.svg';
import githubIconSvg from '../../../../public/img/github.svg';
import linkedinIconSvg from '../../../../public/img/linkedin.svg';
import clerkLogoSvg from '../../../../public/img/clerk_logo_black.svg';
import firebaseLogoSvg from '../../../../public/img/firebase_auth.svg';

import {
  DashPanel,
  DashPanelHeader,
  DashPage,
  DashEmptyState,
  DashNotice,
  DashShell,
  useFetchedDash,
} from '../_shared';
import { AuthSubState } from './index';

// -------------- mock data --------------

const MOCK_GOOGLE_PROVIDER: OAuthServiceProvider = {
  id: 'mock-google-provider',
  provider_name: 'google',
};

const MOCK_GOOGLE_CLIENT_DEV: OAuthClient = {
  id: 'mock-google-dev',
  client_name: 'google-web',
  provider_id: MOCK_GOOGLE_PROVIDER.id,
  use_shared_credentials: true,
};

const MOCK_GOOGLE_CLIENT_CUSTOM: OAuthClient = {
  id: 'mock-google-custom',
  client_name: 'google-web',
  client_id: '1234567890-abc.apps.googleusercontent.com',
  provider_id: MOCK_GOOGLE_PROVIDER.id,
  use_shared_credentials: false,
};

const MOCK_ORIGINS: AuthorizedOrigin[] = [
  { id: 'mock-1', service: 'generic', params: ['https://example.com'] },
  { id: 'mock-2', service: 'netlify', params: ['my-app'] },
];

// -------------- sub-state planner --------------

type Plan = {
  data: AppsAuthResponse;
  forceShowAddFlow: boolean;
  initialFlowState: AddClientFlowState;
  defaultOpenClientId: string | null;
  scrollTo: 'auth-clients' | 'origins' | 'test-users' | 'magic-email' | null;
  banner: string | null;
};

function injectGoogleClient(
  real: AppsAuthResponse,
  client: OAuthClient,
): AppsAuthResponse {
  const realProviders = real.oauth_service_providers || [];
  const hasGoogle = realProviders.some((p) => p.provider_name === 'google');
  return {
    ...real,
    oauth_service_providers: hasGoogle
      ? realProviders
      : [MOCK_GOOGLE_PROVIDER, ...realProviders],
    oauth_clients: [client],
  };
}

function planForSubState(real: AppsAuthResponse, sub: AuthSubState): Plan {
  const base: Plan = {
    data: real,
    forceShowAddFlow: false,
    initialFlowState: { step: 'idle' },
    defaultOpenClientId: null,
    scrollTo: null,
    banner: null,
  };

  switch (sub) {
    case 'clients-empty':
      return {
        ...base,
        data: { ...real, oauth_clients: [] },
      };

    case 'clients-overview':
      return base;

    case 'picker':
      return {
        ...base,
        forceShowAddFlow: true,
        initialFlowState: { step: 'picking' },
        scrollTo: 'auth-clients',
      };

    case 'add-google-dev':
      return {
        ...base,
        data: ensureGoogleProvider(real),
        forceShowAddFlow: true,
        initialFlowState: { step: 'configuring', providerType: 'google' },
        scrollTo: 'auth-clients',
        banner: "Pick the 'Use dev credentials' tab inside the form.",
      };

    case 'add-google-custom':
      return {
        ...base,
        data: ensureGoogleProvider(real),
        forceShowAddFlow: true,
        initialFlowState: { step: 'configuring', providerType: 'google' },
        scrollTo: 'auth-clients',
        banner: "Pick the 'Use my own' tab inside the form.",
      };

    case 'client-success': {
      const firstClient = (real.oauth_clients || [])[0];
      if (firstClient) {
        return {
          ...base,
          defaultOpenClientId: firstClient.id,
          scrollTo: 'auth-clients',
        };
      }
      return {
        ...base,
        data: injectGoogleClient(real, MOCK_GOOGLE_CLIENT_CUSTOM),
        defaultOpenClientId: MOCK_GOOGLE_CLIENT_CUSTOM.id,
        scrollTo: 'auth-clients',
        banner: 'Mocked Google client (no real clients on this app).',
      };
    }

    case 'google-dev-creds':
      return {
        ...base,
        data: injectGoogleClient(real, MOCK_GOOGLE_CLIENT_DEV),
        defaultOpenClientId: MOCK_GOOGLE_CLIENT_DEV.id,
        scrollTo: 'auth-clients',
        banner: 'Mocked Google client with use_shared_credentials=true.',
      };

    case 'google-custom-creds':
      return {
        ...base,
        data: injectGoogleClient(real, MOCK_GOOGLE_CLIENT_CUSTOM),
        defaultOpenClientId: MOCK_GOOGLE_CLIENT_CUSTOM.id,
        scrollTo: 'auth-clients',
        banner: 'Mocked Google client with custom credentials.',
      };

    case 'google-edit-creds':
      return {
        ...base,
        data: injectGoogleClient(real, MOCK_GOOGLE_CLIENT_CUSTOM),
        defaultOpenClientId: MOCK_GOOGLE_CLIENT_CUSTOM.id,
        scrollTo: 'auth-clients',
        banner:
          "Click 'Update credentials' inside the panel to see the editor.",
      };

    case 'origins-list':
      return {
        ...base,
        data: {
          ...real,
          authorized_redirect_origins:
            (real.authorized_redirect_origins || []).length > 0
              ? real.authorized_redirect_origins
              : MOCK_ORIGINS,
        },
        scrollTo: 'origins',
      };

    case 'origins-add':
      return {
        ...base,
        data: { ...real, authorized_redirect_origins: [] },
        scrollTo: 'origins',
        banner: 'Add form is auto-opened when no origins exist.',
      };

    case 'test-users':
      return { ...base, scrollTo: 'test-users' };

    case 'magic-email':
      return { ...base, scrollTo: 'magic-email' };
  }
}

function ensureGoogleProvider(real: AppsAuthResponse): AppsAuthResponse {
  const providers = real.oauth_service_providers || [];
  if (providers.some((p) => p.provider_name === 'google')) return real;
  return {
    ...real,
    oauth_service_providers: [MOCK_GOOGLE_PROVIDER, ...providers],
  };
}

// -------------- provider picker / add flow (copied) --------------

type ProviderType =
  | 'google'
  | 'apple'
  | 'github'
  | 'linkedin'
  | 'clerk'
  | 'firebase';

type AddClientFlowState =
  | { step: 'idle' }
  | { step: 'picking' }
  | { step: 'configuring'; providerType: ProviderType };

const PROVIDER_CONFIG: Record<
  ProviderType,
  { label: string; icon: any; darkInvert?: boolean }
> = {
  google: { label: 'Google', icon: googleIconSvg },
  apple: { label: 'Apple', icon: appleLogoSvg, darkInvert: true },
  github: { label: 'GitHub', icon: githubIconSvg, darkInvert: true },
  linkedin: { label: 'LinkedIn', icon: linkedinIconSvg },
  clerk: { label: 'Clerk', icon: clerkLogoSvg, darkInvert: true },
  firebase: { label: 'Firebase', icon: firebaseLogoSvg },
};

const PROVIDER_ORDER: ProviderType[] = [
  'google',
  'apple',
  'github',
  'linkedin',
  'clerk',
  'firebase',
];

function ProviderPickerButton({
  providerType,
  onClick,
}: {
  providerType: ProviderType;
  onClick: () => void;
}) {
  const cfg = PROVIDER_CONFIG[providerType];
  return (
    <button
      onClick={onClick}
      className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-[#fbfaf8] dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
    >
      <Image
        alt={`${cfg.label} icon`}
        src={cfg.icon}
        width={24}
        height={24}
        className={cfg.darkInvert ? 'dark:invert' : ''}
      />
      <span className="text-sm">{cfg.label}</span>
    </button>
  );
}

function ProviderPicker({
  onSelect,
  onCancel,
}: {
  onSelect: (providerType: ProviderType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <DashPanelHeader
        title="Select auth provider"
        description="Choose a provider to configure for sign in."
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PROVIDER_ORDER.map((providerType) => (
          <ProviderPickerButton
            key={providerType}
            providerType={providerType}
            onClick={() => onSelect(providerType)}
          />
        ))}
      </div>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function AddClientFlow({
  app,
  providers,
  usedClientNames,
  onAddProvider,
  onAddClient,
  onCancel,
  initialFlowState,
}: {
  app: InstantApp;
  providers: Record<string, OAuthServiceProvider>;
  usedClientNames: Set<string>;
  onAddProvider: (provider: OAuthServiceProvider) => void;
  onAddClient: (client: OAuthClient) => void;
  onCancel?: () => void;
  initialFlowState?: AddClientFlowState;
}) {
  const token = useContext(TokenContext);
  const [state, setState] = useState<AddClientFlowState>(
    initialFlowState ?? { step: 'idle' },
  );
  const [isCreatingProvider, setIsCreatingProvider] = useState(false);

  const handleSelectProvider = async (providerType: ProviderType) => {
    if (!providers[providerType]) {
      setIsCreatingProvider(true);
      try {
        const resp = await addProvider({
          token,
          appId: app.id,
          providerName: providerType,
        });
        onAddProvider(resp.provider);
        setState({ step: 'configuring', providerType });
      } catch (e) {
        console.error(e);
        const msg =
          messageFromInstantError(e as InstantIssue) ||
          `There was an error setting up ${PROVIDER_CONFIG[providerType].label}.`;
        errorToast(msg, { autoClose: 5000 });
      } finally {
        setIsCreatingProvider(false);
      }
    } else {
      setState({ step: 'configuring', providerType });
    }
  };

  const handleAddClient = (client: OAuthClient) => {
    onAddClient(client);
    setState({ step: 'idle' });
  };

  const handleCancel = () => {
    setState({ step: 'idle' });
    onCancel?.();
  };

  if (state.step === 'idle') {
    return (
      <Button onClick={() => setState({ step: 'picking' })} variant="secondary">
        <PlusIcon height={14} /> Add client
      </Button>
    );
  }

  if (state.step === 'picking' || isCreatingProvider) {
    return (
      <div className="relative">
        <ProviderPicker
          onSelect={handleSelectProvider}
          onCancel={handleCancel}
        />
        {isCreatingProvider && (
          <div className="absolute inset-0 flex items-center justify-center rounded bg-white/80 dark:bg-neutral-900/80">
            <Loading />
          </div>
        )}
      </div>
    );
  }

  if (state.step === 'configuring') {
    const provider = providers[state.providerType];
    if (!provider) return null;

    switch (state.providerType) {
      case 'google':
        return (
          <AddGoogleClientForm
            app={app}
            provider={provider}
            onAddClient={handleAddClient}
            onCancel={handleCancel}
            usedClientNames={usedClientNames}
          />
        );
      case 'apple':
        return (
          <AddAppleClientForm
            app={app}
            provider={provider}
            onAddProvider={onAddProvider}
            onAddClient={handleAddClient}
            onCancel={handleCancel}
            usedClientNames={usedClientNames}
          />
        );
      case 'github':
        return (
          <AddGitHubClientForm
            app={app}
            provider={provider}
            onAddClient={handleAddClient}
            onCancel={handleCancel}
            usedClientNames={usedClientNames}
          />
        );
      case 'linkedin':
        return (
          <AddLinkedInClientForm
            app={app}
            provider={provider}
            onAddClient={handleAddClient}
            onCancel={handleCancel}
            usedClientNames={usedClientNames}
          />
        );
      case 'clerk':
        return (
          <AddClerkClientForm
            app={app}
            provider={provider}
            onAddClient={handleAddClient}
            onCancel={handleCancel}
            usedClientNames={usedClientNames}
          />
        );
      case 'firebase':
        return (
          <AddFirebaseClientForm
            app={app}
            provider={provider}
            onAddClient={handleAddClient}
            onCancel={handleCancel}
            usedClientNames={usedClientNames}
          />
        );
      default:
        return null;
    }
  }

  return null;
}

function ClientItem({
  app,
  client,
  providerName,
  onUpdateClient,
  onDeleteClient,
  defaultOpen,
}: {
  app: InstantApp;
  client: OAuthClient;
  providerName: string;
  onUpdateClient?: (client: OAuthClient) => void;
  onDeleteClient: (client: OAuthClient) => void;
  defaultOpen: boolean;
}) {
  switch (providerName) {
    case 'google':
      return (
        <GoogleClient
          app={app}
          client={client}
          onUpdateClient={onUpdateClient || (() => {})}
          onDeleteClient={onDeleteClient}
          defaultOpen={defaultOpen}
        />
      );
    case 'apple':
      return (
        <AppleClient
          app={app}
          client={client}
          onDeleteClient={onDeleteClient}
          defaultOpen={defaultOpen}
        />
      );
    case 'github':
      return (
        <GitHubClient
          app={app}
          client={client}
          onUpdateClient={onUpdateClient || (() => {})}
          onDeleteClient={onDeleteClient}
          defaultOpen={defaultOpen}
        />
      );
    case 'linkedin':
      return (
        <LinkedInClient
          app={app}
          client={client}
          onUpdateClient={onUpdateClient || (() => {})}
          onDeleteClient={onDeleteClient}
          defaultOpen={defaultOpen}
        />
      );
    case 'clerk':
      return (
        <ClerkClient
          app={app}
          client={client}
          onUpdateClient={onUpdateClient || (() => {})}
          onDeleteClient={onDeleteClient}
          defaultOpen={defaultOpen}
        />
      );
    case 'firebase':
      return (
        <FirebaseClient
          app={app}
          client={client}
          onDeleteClient={onDeleteClient}
          defaultOpen={defaultOpen}
        />
      );
    default:
      return null;
  }
}

function EmptyState({ onAddClient }: { onAddClient: () => void }) {
  return (
    <DashEmptyState
      title="No OAuth clients configured"
      description="Add an auth client to enable social login or third-party authentication for your app."
      action={
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-2">
            {PROVIDER_ORDER.slice(0, 4).map((providerType) => (
              <Image
                key={providerType}
                alt={`${PROVIDER_CONFIG[providerType].label} icon`}
                src={PROVIDER_CONFIG[providerType].icon}
                width={20}
                height={20}
                className={
                  PROVIDER_CONFIG[providerType].darkInvert
                    ? 'opacity-40 dark:opacity-80 dark:invert'
                    : 'opacity-40 dark:opacity-80'
                }
              />
            ))}
          </div>
          <Button onClick={onAddClient} variant="secondary">
            <PlusIcon height={14} /> Add client
          </Button>
        </div>
      }
    />
  );
}

// -------------- body --------------

function SubStateBanner({ message }: { message: string }) {
  return <DashNotice tone="warning">{message}</DashNotice>;
}

function AuthBody({
  app,
  initialData,
  plan,
}: {
  app: InstantApp;
  initialData: AppsAuthResponse;
  plan: Plan;
}) {
  // Local copy of data so we can update it after mutations without forcing a re-fetch
  const [data, setData] = useState<AppsAuthResponse>(initialData);
  const [lastCreatedClientId, setLastCreatedClientId] = useState<null | string>(
    null,
  );
  const [showAddFlow, setShowAddFlow] = useState(plan.forceShowAddFlow);

  // Refs for scrolling
  const clientsRef = useRef<HTMLDivElement>(null);
  const originsRef = useRef<HTMLDivElement>(null);
  const testUsersRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ref =
      plan.scrollTo === 'auth-clients'
        ? clientsRef
        : plan.scrollTo === 'origins'
          ? originsRef
          : plan.scrollTo === 'test-users'
            ? testUsersRef
            : plan.scrollTo === 'magic-email'
              ? emailRef
              : null;
    ref?.current?.scrollIntoView({ block: 'start' });
  }, [plan.scrollTo]);

  const handleAddOrigin = (origin: AuthorizedOrigin) => {
    setData({
      ...data,
      authorized_redirect_origins: [
        origin,
        ...(data.authorized_redirect_origins || []),
      ],
    });
  };

  const handleRemoveOrigin = (origin: AuthorizedOrigin) => {
    setData({
      ...data,
      authorized_redirect_origins: data.authorized_redirect_origins?.filter(
        (o) => o.id !== origin.id,
      ),
    });
  };

  const handleAddProvider = (provider: OAuthServiceProvider) => {
    setData({
      ...data,
      oauth_service_providers: [
        provider,
        ...(data.oauth_service_providers || []),
      ],
    });
  };

  const handleAddClient = (client: OAuthClient) => {
    setLastCreatedClientId(client.id);
    setShowAddFlow(false);
    setData({
      ...data,
      oauth_clients: [client, ...(data.oauth_clients || [])],
    });
  };

  const handleDeleteClient = (client: OAuthClient) => {
    setData({
      ...data,
      oauth_clients: (data.oauth_clients || []).filter(
        (c) => c.id !== client.id,
      ),
    });
  };

  const handleUpdateClient = (client: OAuthClient) => {
    setData({
      ...data,
      oauth_clients: (data.oauth_clients || []).map((c) =>
        c.id !== client.id ? c : client,
      ),
    });
  };

  const providersByName: Record<string, OAuthServiceProvider> =
    data.oauth_service_providers?.reduce(
      (acc: Record<string, OAuthServiceProvider>, p) => {
        acc[p.provider_name] = p;
        return acc;
      },
      {},
    ) || {};

  const providersById: Record<string, OAuthServiceProvider> =
    data.oauth_service_providers?.reduce(
      (acc: Record<string, OAuthServiceProvider>, p) => {
        acc[p.id] = p;
        return acc;
      },
      {},
    ) || {};

  const usedClientNames = new Set<string>();
  for (const client of data.oauth_clients || []) {
    usedClientNames.add(client.client_name);
  }

  const clients = data.oauth_clients || [];
  const hasClients = clients.length > 0;

  const expandedClientId = plan.defaultOpenClientId ?? lastCreatedClientId;

  return (
    <DashPage size="wide">
      <div>
        <SectionHeading>Auth</SectionHeading>
        <Content className="mt-1">
          Configure OAuth clients, redirect origins, test users, and magic code
          email for this app.
        </Content>
      </div>
      {plan.banner && <SubStateBanner message={plan.banner} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <DashPanel ref={clientsRef} className="min-w-0">
          <DashPanelHeader
            title="Auth clients"
            description="Enable social login or third-party authentication."
          />

          {!hasClients && !showAddFlow && (
            <EmptyState onAddClient={() => setShowAddFlow(true)} />
          )}

          {hasClients && (
            <div className="flex flex-col gap-3">
              {clients.map((client) => {
                const provider = providersById[client.provider_id];
                const providerName = provider?.provider_name || 'unknown';
                const open = client.id === expandedClientId;
                return (
                  <ClientItem
                    key={open ? `${client.id}-open` : client.id}
                    app={app}
                    client={client}
                    providerName={providerName}
                    onUpdateClient={handleUpdateClient}
                    onDeleteClient={handleDeleteClient}
                    defaultOpen={open}
                  />
                );
              })}
            </div>
          )}

          {(hasClients || showAddFlow) && (
            <div className="mt-4">
              <AddClientFlow
                key={
                  showAddFlow
                    ? `adding-${plan.initialFlowState.step}-${
                        plan.initialFlowState.step === 'configuring'
                          ? plan.initialFlowState.providerType
                          : ''
                      }`
                    : 'idle'
                }
                app={app}
                providers={providersByName}
                usedClientNames={usedClientNames}
                onAddProvider={handleAddProvider}
                onAddClient={handleAddClient}
                onCancel={() => setShowAddFlow(false)}
                initialFlowState={
                  showAddFlow ? plan.initialFlowState : { step: 'idle' }
                }
              />
            </div>
          )}
        </DashPanel>

        <div className="flex min-w-0 flex-col gap-4">
          <DashPanel ref={originsRef}>
            <AuthorizedOrigins
              app={app}
              origins={data.authorized_redirect_origins || []}
              onAddOrigin={handleAddOrigin}
              onRemoveOrigin={handleRemoveOrigin}
            />
          </DashPanel>

          <DashPanel ref={testUsersRef}>
            <TestUsers app={app} />
          </DashPanel>
        </div>
      </div>

      <DashPanel ref={emailRef} className="min-w-0">
        <Email app={app} />
      </DashPanel>
    </DashPage>
  );
}

// -------------- outer view --------------

function AuthDataLoader({ app, sub }: { app: InstantApp; sub: AuthSubState }) {
  const authResponse = useAuthedFetch<AppsAuthResponse>(
    `${config.apiURI}/dash/apps/${app.id}/auth`,
  );

  if (authResponse.isLoading) {
    return <Loading />;
  }

  if (!authResponse.data) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-2">
        <ErrorMessage>
          <div className="flex gap-2">
            There was an error loading the auth data.{' '}
            <Button
              variant="subtle"
              size="mini"
              onClick={() =>
                authResponse.mutate(undefined, { revalidate: true })
              }
            >
              Refresh.
            </Button>
          </div>
        </ErrorMessage>
      </div>
    );
  }

  const plan = planForSubState(authResponse.data, sub);

  return <AuthBody key={sub} app={app} initialData={plan.data} plan={plan} />;
}

export function Current({ sub }: { sub: AuthSubState }) {
  const dashResponse = useFetchedDash();
  const app = dashResponse.data.apps[0];

  if (!app) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-center">
        <div className="max-w-sm">
          <p className="mb-4 text-sm text-gray-700 dark:text-neutral-300">
            You don't have any apps yet. Create one on the real dashboard, then
            come back.
          </p>
          <a
            href="/dash"
            className="text-sm text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
          >
            Go to /dash
          </a>
        </div>
      </div>
    );
  }

  return (
    <DashShell active="auth" app={app}>
      <AuthDataLoader app={app} sub={sub} />
    </DashShell>
  );
}

import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/solid';

import {
  BlockHeading,
  Button,
  cn,
  Content,
  SectionHeading,
  TextInput,
} from '@/components/ui';
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
import {
  AuthorizedOrigins,
  AuthorizedOriginRow,
  AuthorizedOriginsForm,
} from '@/components/dash/auth/Origins';
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
import { AuthFlows, FlowIdea } from './Flows';

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
    case 'redesign-quiet-panels':
    case 'redesign-quiet-rows':
    case 'redesign-quiet-column':
    case 'redesign-tracks':
    case 'redesign-columns':
    case 'redesign-focused':
      return { ...base, data: populatedDemo(real) };

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

    // flow-* states are routed before this loader and never reach here.
    default:
      return base;
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

// The redesign reads best with a populated app, so the two-method hierarchy is
// legible. Inject a sample client + origins only when the real app has none.
function populatedDemo(real: AppsAuthResponse): AppsAuthResponse {
  const withClient =
    (real.oauth_clients?.length ?? 0) > 0
      ? real
      : injectGoogleClient(real, MOCK_GOOGLE_CLIENT_CUSTOM);
  return {
    ...withClient,
    authorized_redirect_origins:
      (real.authorized_redirect_origins?.length ?? 0) > 0
        ? real.authorized_redirect_origins
        : MOCK_ORIGINS,
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

// ============================================================
// Redesign: auth organized by the two ways people sign in.
//
// Instead of four equal cards, the page groups around two "methods",
// each owning its dependency:
//   Social login → auth clients + redirect origins
//   Magic codes  → magic-code email + test users (static codes)
//
// Variants share the same content (the *Inner components) and only
// differ in chrome: three quiet/functional layouts and three bolder
// "control panel" ones.
// ============================================================

type RedesignVariant =
  | 'tracks'
  | 'columns'
  | 'focused'
  | 'quiet-panels'
  | 'quiet-rows'
  | 'quiet-column';

function expiryLabel(minutes?: number | null) {
  switch (minutes ?? 10) {
    case 60:
      return '1 hour';
    case 1440:
      return '24 hours';
    default:
      return `${minutes ?? 10} minutes`;
  }
}

// ---- shared content (the substance, free of any section chrome) ----
// Each "inner" renders just the functional body; the bold and quiet variants
// wrap them differently, so the layout exploration never duplicates logic.

function ClientsInner({
  app,
  clients,
  providersById,
  providersByName,
  usedClientNames,
  onAddProvider,
  onAddClient,
  onUpdateClient,
  onDeleteClient,
}: {
  app: InstantApp;
  clients: OAuthClient[];
  providersById: Record<string, OAuthServiceProvider>;
  providersByName: Record<string, OAuthServiceProvider>;
  usedClientNames: Set<string>;
  onAddProvider: (provider: OAuthServiceProvider) => void;
  onAddClient: (client: OAuthClient) => void;
  onUpdateClient: (client: OAuthClient) => void;
  onDeleteClient: (client: OAuthClient) => void;
}) {
  const [showAddFlow, setShowAddFlow] = useState(false);
  const [lastCreatedClientId, setLastCreatedClientId] = useState<string | null>(
    null,
  );
  const hasClients = clients.length > 0;
  const handleAdd = (client: OAuthClient) => {
    setLastCreatedClientId(client.id);
    setShowAddFlow(false);
    onAddClient(client);
  };
  return (
    <>
      {!hasClients && !showAddFlow && (
        <EmptyState onAddClient={() => setShowAddFlow(true)} />
      )}
      {hasClients && (
        <div className="flex flex-col gap-3">
          {clients.map((client) => {
            const provider = providersById[client.provider_id];
            const providerName = provider?.provider_name || 'unknown';
            const open = client.id === lastCreatedClientId;
            return (
              <ClientItem
                key={open ? `${client.id}-open` : client.id}
                app={app}
                client={client}
                providerName={providerName}
                onUpdateClient={onUpdateClient}
                onDeleteClient={onDeleteClient}
                defaultOpen={open}
              />
            );
          })}
        </div>
      )}
      {(hasClients || showAddFlow) && (
        <div className="mt-4">
          <AddClientFlow
            key={showAddFlow ? 'adding' : 'idle'}
            app={app}
            providers={providersByName}
            usedClientNames={usedClientNames}
            onAddProvider={onAddProvider}
            onAddClient={handleAdd}
            onCancel={() => setShowAddFlow(false)}
            initialFlowState={showAddFlow ? { step: 'picking' } : { step: 'idle' }}
          />
        </div>
      )}
    </>
  );
}

function OriginsInner({
  app,
  origins,
  onAdd,
  onRemove,
}: {
  app: InstantApp;
  origins: AuthorizedOrigin[];
  onAdd: (origin: AuthorizedOrigin) => void;
  onRemove: (origin: AuthorizedOrigin) => void;
}) {
  const [showForm, setShowForm] = useState(origins.length === 0);
  return (
    <div className="flex flex-col gap-2">
      {origins.map((o) => (
        <AuthorizedOriginRow
          key={o.id}
          app={app}
          origin={o}
          onRemoveOrigin={onRemove}
        />
      ))}
      {showForm ? (
        <AuthorizedOriginsForm
          app={app}
          onAddOrigin={(o) => {
            setShowForm(false);
            onAdd(o);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button variant="secondary" onClick={() => setShowForm(true)}>
          <PlusIcon height={14} /> Add an origin
        </Button>
      )}
    </div>
  );
}

function EmailInner({ app }: { app: InstantApp }) {
  const subject =
    app.magic_code_email_template?.subject ||
    '{code} is your code for {app_title}';
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-xs text-gray-400 dark:text-neutral-500">
          Subject
        </div>
        <div className="mt-0.5 truncate font-mono text-sm text-gray-700 dark:text-neutral-300">
          {subject}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-500 dark:text-neutral-400">
          Expires after {expiryLabel(app.magic_code_expiry_minutes)}.
        </span>
        <Button variant="secondary">Customize</Button>
      </div>
    </div>
  );
}

// Local-only test users (the viewer keeps state but makes no network calls).
type LocalTestUser = { id: string; email: string; code: string };

function TestUsersInner() {
  const [users, setUsers] = useState<LocalTestUser[]>([
    { id: 'seed', email: 'reviewer@example.com', code: '424242' },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('424242');

  const valid = email.trim().length > 0 && /^\d{6}$/.test(code);
  const add = () => {
    if (!valid) return;
    setUsers((u) => [
      { id: crypto.randomUUID(), email: email.trim().toLowerCase(), code },
      ...u,
    ]);
    setEmail('');
    setCode('424242');
    setShowForm(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {users.map((user) => (
        <div
          key={user.id}
          className="flex items-center justify-between rounded-md border border-gray-200 bg-[#fbfaf8] px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {user.email}
            </span>
            <span className="font-mono text-xs text-gray-500 dark:text-neutral-400">
              code {user.code}
            </span>
          </div>
          <button
            type="button"
            aria-label="Remove test user"
            className="cursor-pointer text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
            onClick={() => setUsers((u) => u.filter((x) => x.id !== user.id))}
          >
            <TrashIcon height="1rem" />
          </button>
        </div>
      ))}
      {showForm ? (
        <div className="flex items-start gap-2 rounded-md border border-gray-200 bg-[#fbfaf8] p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex-1">
            <TextInput
              label="Email"
              placeholder="test@example.com"
              value={email}
              onChange={setEmail}
              autoFocus
            />
          </div>
          <div className="w-32">
            <TextInput
              label="Code"
              placeholder="123456"
              value={code}
              onChange={setCode}
              error={
                code && !/^\d{6}$/.test(code) ? 'Must be 6 digits' : undefined
              }
            />
          </div>
          <div className="pt-6">
            <Button variant="primary" onClick={add} disabled={!valid}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setShowForm(true)}>
          <PlusIcon height={14} /> Add a test user
        </Button>
      )}
    </div>
  );
}

// ---- bold ("control panel") chrome ----

// Small mono telemetry pill: a dot + uppercase label, like a status readout.
function StatusPill({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-gray-500 uppercase dark:text-neutral-400">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          on ? 'bg-orange-500' : 'bg-gray-300 dark:bg-neutral-700',
        )}
      />
      {children}
    </span>
  );
}

// The dominant hierarchy level: a big mono index, a Switzer title, a blurb,
// and a live status line, all over a hairline rule.
function MethodHeader({
  index,
  title,
  blurb,
  status,
  compact,
}: {
  index: string;
  title: string;
  blurb: string;
  status: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 sm:flex-row sm:items-start sm:justify-between dark:border-neutral-800">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-2xl leading-none font-bold tabular-nums text-orange-500">
          {index}
        </span>
        <div>
          <h3
            className={cn(
              'font-semibold tracking-tight text-gray-950 dark:text-white',
              compact ? 'text-base' : 'text-xl',
            )}
          >
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-neutral-400">
            {blurb}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 sm:justify-end sm:pt-1">
        {status}
      </div>
    </div>
  );
}

// A block is the secondary level: hairline card, small label.
function MethodBlock({
  children,
  nested,
  className,
}: {
  children: ReactNode;
  nested?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-gray-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900',
        nested && 'border-l-2 border-l-orange-500/40',
        className,
      )}
    >
      {children}
    </div>
  );
}

function BlockLabel({
  title,
  hint,
  badge,
}: {
  title: ReactNode;
  hint?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <BlockHeading>{title}</BlockHeading>
        {hint ? <Content className="mt-0.5 text-sm">{hint}</Content> : null}
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </div>
  );
}

// Mono "dependency" note that ties a nested block to its parent method.
function DependencyNote({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[11px] tracking-wider text-orange-500/80 uppercase">
      ↳ {children}
    </div>
  );
}

// ---- quiet ("Dieter Rams") chrome: hierarchy from type + space, no decoration ----

function QuietMethodTitle({
  title,
  meta,
}: {
  title: string;
  meta?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h3 className="text-lg font-semibold tracking-tight text-gray-950 dark:text-white">
        {title}
      </h3>
      {meta ? (
        <span className="text-sm text-gray-400 dark:text-neutral-500">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

function QuietItem({
  title,
  helper,
  children,
  className,
}: {
  title: ReactNode;
  helper?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('py-5', className)}>
      <div className="text-sm font-semibold text-gray-900 dark:text-white">
        {title}
      </div>
      {helper ? (
        <p className="mt-0.5 text-sm text-gray-500 dark:text-neutral-400">
          {helper}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function FocusedSwitch({
  value,
  onChange,
}: {
  value: 'social' | 'magic';
  onChange: (v: 'social' | 'magic') => void;
}) {
  const options: { id: 'magic' | 'social'; label: string }[] = [
    { id: 'magic', label: '02 · Magic codes' },
    { id: 'social', label: '01 · Social login' },
  ];
  return (
    <div className="inline-flex rounded-md border border-gray-200 bg-white p-1 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              'rounded-sm px-3 py-1.5 font-mono text-xs tracking-wider uppercase transition-colors',
              active
                ? 'bg-orange-500 text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AuthRedesign({
  app,
  initialData,
  variant,
}: {
  app: InstantApp;
  initialData: AppsAuthResponse;
  variant: RedesignVariant;
}) {
  const [data, setData] = useState<AppsAuthResponse>(initialData);
  const [focusedMethod, setFocusedMethod] = useState<'social' | 'magic'>(
    'magic',
  );

  const handleAddOrigin = (origin: AuthorizedOrigin) =>
    setData((d) => ({
      ...d,
      authorized_redirect_origins: [
        origin,
        ...(d.authorized_redirect_origins || []),
      ],
    }));

  const handleRemoveOrigin = (origin: AuthorizedOrigin) =>
    setData((d) => ({
      ...d,
      authorized_redirect_origins: d.authorized_redirect_origins?.filter(
        (o) => o.id !== origin.id,
      ),
    }));

  const handleAddProvider = (provider: OAuthServiceProvider) =>
    setData((d) => ({
      ...d,
      oauth_service_providers: [provider, ...(d.oauth_service_providers || [])],
    }));

  const handleAddClient = (client: OAuthClient) =>
    setData((d) => ({
      ...d,
      oauth_clients: [client, ...(d.oauth_clients || [])],
    }));

  const handleDeleteClient = (client: OAuthClient) =>
    setData((d) => ({
      ...d,
      oauth_clients: (d.oauth_clients || []).filter((c) => c.id !== client.id),
    }));

  const handleUpdateClient = (client: OAuthClient) =>
    setData((d) => ({
      ...d,
      oauth_clients: (d.oauth_clients || []).map((c) =>
        c.id !== client.id ? c : client,
      ),
    }));

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
  const origins = data.authorized_redirect_origins || [];
  const hasClients = clients.length > 0;
  const hasCustomEmail = Boolean(app.magic_code_email_template);

  // Shared content, wrapped differently by each variant.
  const clientsInner = (
    <ClientsInner
      app={app}
      clients={clients}
      providersById={providersById}
      providersByName={providersByName}
      usedClientNames={usedClientNames}
      onAddProvider={handleAddProvider}
      onAddClient={handleAddClient}
      onUpdateClient={handleUpdateClient}
      onDeleteClient={handleDeleteClient}
    />
  );
  const originsInner = (
    <OriginsInner
      app={app}
      origins={origins}
      onAdd={handleAddOrigin}
      onRemove={handleRemoveOrigin}
    />
  );
  const emailInner = <EmailInner app={app} />;
  const testUsersInner = <TestUsersInner />;

  // Plain, factual state lines for the quiet variants.
  const socialMeta =
    hasClients || origins.length > 0
      ? `${clients.length} client${clients.length === 1 ? '' : 's'}, ${
          origins.length
        } origin${origins.length === 1 ? '' : 's'}`
      : 'Not set up';
  const magicMeta = hasCustomEmail ? 'Custom email' : 'Default email';

  // ---- quiet · two panels (methods side by side, hairline-divided items) ----
  if (variant === 'quiet-panels') {
    return (
      <DashPage size="wide">
        <div className="grid gap-5 duration-500 animate-in fade-in lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="border-b border-gray-100 px-5 py-4 dark:border-neutral-800">
              <QuietMethodTitle title="Social login" meta={socialMeta} />
            </div>
            <div className="divide-y divide-gray-100 px-5 dark:divide-neutral-800">
              <QuietItem title="Auth clients">{clientsInner}</QuietItem>
              <QuietItem
                title="Redirect origins"
                helper="Allowed URLs for the OAuth redirect flow."
              >
                {originsInner}
              </QuietItem>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="border-b border-gray-100 px-5 py-4 dark:border-neutral-800">
              <QuietMethodTitle title="Magic codes" meta={magicMeta} />
            </div>
            <div className="divide-y divide-gray-100 px-5 dark:divide-neutral-800">
              <QuietItem title="Magic code email">{emailInner}</QuietItem>
              <QuietItem
                title="Test users"
                helper="Codes that never expire."
              >
                {testUsersInner}
              </QuietItem>
            </div>
          </div>
        </div>
      </DashPage>
    );
  }

  // ---- quiet · settings rows (grouped containers, stacked) ----
  if (variant === 'quiet-rows') {
    return (
      <DashPage size="narrow">
        <div className="flex flex-col gap-8 duration-500 animate-in fade-in">
          <section>
            <QuietMethodTitle title="Social login" meta={socialMeta} />
            <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-5 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
              <QuietItem title="Auth clients">{clientsInner}</QuietItem>
              <QuietItem
                title="Redirect origins"
                helper="Allowed URLs for the OAuth redirect flow."
              >
                {originsInner}
              </QuietItem>
            </div>
          </section>
          <section>
            <QuietMethodTitle title="Magic codes" meta={magicMeta} />
            <div className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-5 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
              <QuietItem title="Magic code email">{emailInner}</QuietItem>
              <QuietItem
                title="Test users"
                helper="Codes that never expire."
              >
                {testUsersInner}
              </QuietItem>
            </div>
          </section>
        </div>
      </DashPage>
    );
  }

  // ---- quiet · one column (no card chrome, space + a single rule) ----
  if (variant === 'quiet-column') {
    return (
      <DashPage size="narrow">
        <div className="duration-500 animate-in fade-in">
          <section className="pb-10">
            <QuietMethodTitle title="Social login" meta={socialMeta} />
            <div className="mt-2">
              <QuietItem title="Auth clients">{clientsInner}</QuietItem>
              <QuietItem
                title="Redirect origins"
                helper="Allowed URLs for the OAuth redirect flow."
              >
                {originsInner}
              </QuietItem>
            </div>
          </section>
          <div className="border-t border-gray-200 dark:border-neutral-800" />
          <section className="pt-10">
            <QuietMethodTitle title="Magic codes" meta={magicMeta} />
            <div className="mt-2">
              <QuietItem title="Magic code email">{emailInner}</QuietItem>
              <QuietItem
                title="Test users"
                helper="Codes that never expire."
              >
                {testUsersInner}
              </QuietItem>
            </div>
          </section>
        </div>
      </DashPage>
    );
  }

  // ---- bold variants (the "control panel" direction) ----
  const clientsBlock = (
    <MethodBlock>
      <BlockLabel
        title="Auth clients"
        hint="Sign in with Google, Apple, GitHub, and more."
      />
      {clientsInner}
    </MethodBlock>
  );

  const emailBlock = (
    <MethodBlock>
      <BlockLabel
        title="Magic code email"
        hint="The email people get when they sign in with a code."
        badge={
          <StatusPill on={hasCustomEmail}>
            {hasCustomEmail ? 'Custom' : 'Default'}
          </StatusPill>
        }
      />
      {emailInner}
    </MethodBlock>
  );

  const originsBlockBold = (nested: boolean) => (
    <MethodBlock nested={nested}>
      {nested ? (
        <DependencyNote>Required for the OAuth redirect flow</DependencyNote>
      ) : null}
      <BlockLabel
        title="Redirect origins"
        hint="Allow OAuth sign-in to start from your site's URLs."
      />
      {originsInner}
    </MethodBlock>
  );

  const testUsersBlockBold = (nested: boolean) => (
    <MethodBlock nested={nested}>
      {nested ? (
        <DependencyNote>A magic code that never expires</DependencyNote>
      ) : null}
      <BlockLabel
        title="Test users"
        hint="Static codes for development, CI, and app-store review."
      />
      {testUsersInner}
    </MethodBlock>
  );

  const socialStatus = (
    <>
      <StatusPill on={hasClients}>
        {clients.length} client{clients.length === 1 ? '' : 's'}
      </StatusPill>
      <StatusPill on={origins.length > 0}>
        {origins.length} origin{origins.length === 1 ? '' : 's'}
      </StatusPill>
    </>
  );

  const magicStatus = (
    <>
      <StatusPill on>Always on</StatusPill>
      <StatusPill on={hasCustomEmail}>
        {hasCustomEmail ? 'Custom email' : 'Default email'}
      </StatusPill>
    </>
  );

  const header = (
    <div>
      <div className="font-mono text-[11px] tracking-[0.2em] text-orange-500 uppercase">
        Authentication
      </div>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">
        Two ways people sign in
      </h2>
      <Content className="mt-1">
        Configure how users authenticate with {app.title}. Social login and
        magic codes are independent — set up either or both.
      </Content>
    </div>
  );

  // ---- tracks: stacked methods, dependencies nested + indented ----
  if (variant === 'tracks') {
    return (
      <DashPage size="wide">
        {header}
        <section className="flex flex-col gap-4 duration-500 animate-in fade-in slide-in-from-bottom-2">
          <MethodHeader
            index="01"
            title="Social login"
            blurb="Let people sign in with an existing account. Opt-in."
            status={socialStatus}
          />
          {clientsBlock}
          <div className="pl-4 sm:pl-8">{originsBlockBold(true)}</div>
        </section>
        <section
          className="flex flex-col gap-4 duration-500 animate-in fade-in slide-in-from-bottom-2"
          style={{ animationDelay: '120ms' }}
        >
          <MethodHeader
            index="02"
            title="Magic codes"
            blurb="Email a one-time code. On by default for every app."
            status={magicStatus}
          />
          {emailBlock}
          <div className="pl-4 sm:pl-8">{testUsersBlockBold(true)}</div>
        </section>
      </DashPage>
    );
  }

  // ---- columns: methods side by side, dependencies as peers ----
  if (variant === 'columns') {
    return (
      <DashPage size="wide">
        {header}
        <div className="flex flex-col gap-1 rounded-md border border-gray-200 bg-white px-4 py-3 font-mono text-xs shadow-xs sm:flex-row sm:items-center sm:gap-8 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="flex items-center gap-2">
            <span className="text-orange-500">SOCIAL ▸</span>
            <span className="text-gray-500 dark:text-neutral-400">
              {clients.length} client{clients.length === 1 ? '' : 's'} ·{' '}
              {origins.length} origin{origins.length === 1 ? '' : 's'}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span className="text-orange-500">MAGIC ▸</span>
            <span className="text-gray-500 dark:text-neutral-400">
              {hasCustomEmail ? 'custom' : 'default'} email · always on
            </span>
          </span>
        </div>
        <div className="grid gap-6 duration-500 animate-in fade-in slide-in-from-bottom-2 lg:grid-cols-2">
          <section className="flex flex-col gap-4">
            <MethodHeader
              index="01"
              title="Social login"
              blurb="Sign in with an existing account."
              status={socialStatus}
              compact
            />
            {clientsBlock}
            {originsBlockBold(false)}
          </section>
          <section className="flex flex-col gap-4">
            <MethodHeader
              index="02"
              title="Magic codes"
              blurb="Email a one-time code."
              status={magicStatus}
              compact
            />
            {emailBlock}
            {testUsersBlockBold(false)}
          </section>
        </div>
      </DashPage>
    );
  }

  // ---- focused: one method at a time via a segmented switch ----
  return (
    <DashPage size="wide">
      {header}
      <FocusedSwitch value={focusedMethod} onChange={setFocusedMethod} />
      <section
        key={focusedMethod}
        className="flex flex-col gap-4 duration-300 animate-in fade-in slide-in-from-bottom-1"
      >
        {focusedMethod === 'social' ? (
          <>
            <MethodHeader
              index="01"
              title="Social login"
              blurb="Let people sign in with an existing account. Opt-in."
              status={socialStatus}
            />
            {clientsBlock}
            {originsBlockBold(true)}
          </>
        ) : (
          <>
            <MethodHeader
              index="02"
              title="Magic codes"
              blurb="Email a one-time code. On by default for every app."
              status={magicStatus}
            />
            {emailBlock}
            {testUsersBlockBold(true)}
          </>
        )}
      </section>
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

  if (sub.startsWith('redesign-')) {
    const variant = sub.slice('redesign-'.length) as RedesignVariant;
    return (
      <AuthRedesign
        key={sub}
        app={app}
        initialData={plan.data}
        variant={variant}
      />
    );
  }

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

  const flowIdea = sub.startsWith('flow-')
    ? (sub.slice('flow-'.length) as FlowIdea)
    : null;

  return (
    <DashShell active="auth" app={app} hideNav={flowIdea === 'merged'}>
      {flowIdea ? (
        <AuthFlows key={sub} idea={flowIdea} appTitle={app.title} />
      ) : (
        <AuthDataLoader app={app} sub={sub} />
      )}
    </DashShell>
  );
}

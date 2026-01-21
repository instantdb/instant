import { ErrorMessage, Loading } from '@/components/dash/shared';
import config from '@/lib/config';
import { useContext, useState } from 'react';

import { Button, Divider, SectionHeading, Content } from '@/components/ui';
import { useAuthedFetch } from '@/lib/auth';
import {
  AppsAuthResponse,
  AuthorizedOrigin,
  InstantApp,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';

import {
  AppleClient,
  AddClientExpanded as AddAppleClientForm,
} from './auth/Apple';
import { ClerkClient, AddClerkClientForm } from './auth/Clerk';
import { Email } from './auth/Email';
import {
  Client as GitHubClient,
  AddClientForm as AddGitHubClientForm,
} from './auth/GitHub';
import {
  Client as GoogleClient,
  AddClientForm as AddGoogleClientForm,
} from './auth/Google';
import {
  Client as LinkedInClient,
  AddClientForm as AddLinkedInClientForm,
} from './auth/LinkedIn';
import { AuthorizedOrigins } from './auth/Origins';
import { FirebaseClient, AddFirebaseClientForm } from './auth/Firebase';
import { addProvider } from './auth/shared';
import { TokenContext } from '@/lib/contexts';
import { errorToast } from '@/lib/toast';
import { messageFromInstantError } from '@/lib/errors';
import { InstantIssue } from '@instantdb/core';

import Image from 'next/image';
import googleIconSvg from '../../public/img/google_g.svg';
import appleLogoSvg from '../../public/img/apple_logo_black.svg';
import githubIconSvg from '../../public/img/github.svg';
import linkedinIconSvg from '../../public/img/linkedin.svg';
import clerkLogoSvg from '../../public/img/clerk_logo_black.svg';
import firebaseLogoSvg from '../../public/img/firebase_auth.svg';
import { PlusIcon } from '@heroicons/react/24/solid';

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
      className="flex cursor-pointer flex-col items-center gap-2 rounded border p-4 transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-700"
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
    <div className="flex flex-col gap-4 rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <SectionHeading>Select auth provider</SectionHeading>
      <div className="grid grid-cols-3 gap-2">
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
  defaultOpen = false,
}: {
  app: InstantApp;
  providers: Record<string, OAuthServiceProvider>;
  usedClientNames: Set<string>;
  onAddProvider: (provider: OAuthServiceProvider) => void;
  onAddClient: (client: OAuthClient) => void;
  onCancel?: () => void;
  defaultOpen?: boolean;
}) {
  const token = useContext(TokenContext);
  const [state, setState] = useState<AddClientFlowState>(
    defaultOpen ? { step: 'picking' } : { step: 'idle' },
  );
  const [isCreatingProvider, setIsCreatingProvider] = useState(false);

  const handleSelectProvider = async (providerType: ProviderType) => {
    // Check if provider exists, if not create it first
    if (!providers[providerType]) {
      setIsCreatingProvider(true);
      try {
        const resp = await addProvider({
          token,
          appId: app.id,
          providerName: providerType,
        });
        onAddProvider(resp.provider);
        // Continue to configuring step with the new provider
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
    if (!provider) {
      // This shouldn't happen, but fallback
      return null;
    }

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
    <div className="flex flex-col items-center gap-4 rounded-sm border border-dashed bg-white p-8 text-center dark:border-neutral-700 dark:bg-neutral-800">
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
      <div className="flex flex-col gap-1">
        <div className="dark:text-white">
          <strong>No OAuth clients configured</strong>
        </div>
        <Content>
          Add an auth client to enable social login or third-party
          authentication for your app.
        </Content>
      </div>
      <Button onClick={onAddClient} variant="secondary">
        <PlusIcon height={14} /> Add client
      </Button>
    </div>
  );
}

export function AppAuth({
  app,
  nav,
}: {
  app: InstantApp;
  nav: (p: { s: string; t?: string; app?: string }) => void;
}) {
  const authResponse = useAuthedFetch<AppsAuthResponse>(
    `${config.apiURI}/dash/apps/${app.id}/auth`,
  );

  // Used to know if we should open the client details by default
  const [lastCreatedClientId, setLastCreatedClientId] = useState<null | string>(
    null,
  );

  // Track if we should show the add client flow
  const [showAddFlow, setShowAddFlow] = useState(false);

  if (authResponse.isLoading) {
    return <Loading />;
  }

  const data = authResponse.data;

  if (!data) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-2">
        <ErrorMessage>
          <div className="flex gap-2">
            There was an error loading the data.{' '}
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

  const handleAddOrigin = (origin: AuthorizedOrigin) => {
    authResponse.mutate({
      ...data,
      authorized_redirect_origins: [
        origin,
        ...(data.authorized_redirect_origins || []),
      ],
    });
  };

  const handleRemoveOrigin = (origin: AuthorizedOrigin) => {
    authResponse.mutate({
      ...data,
      authorized_redirect_origins: data.authorized_redirect_origins?.filter(
        (o) => o.id !== origin.id,
      ),
    });
  };

  const handleAddProvider = (provider: OAuthServiceProvider) => {
    authResponse.mutate({
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
    authResponse.mutate({
      ...data,
      oauth_clients: [client, ...(data.oauth_clients || [])],
    });
  };

  const handleDeleteClient = (client: OAuthClient) => {
    authResponse.mutate({
      ...data,
      oauth_clients: (data.oauth_clients || []).filter(
        (c) => c.id !== client.id,
      ),
    });
  };

  const handleUpdateClient = (client: OAuthClient) => {
    authResponse.mutate({
      ...data,
      oauth_clients: (data.oauth_clients || []).map((c) => {
        if (c.id !== client.id) {
          return c;
        }
        return client;
      }),
    });
  };

  // Build provider lookup by name
  const providersByName: Record<string, OAuthServiceProvider> =
    data.oauth_service_providers?.reduce(
      (acc: Record<string, OAuthServiceProvider>, p) => {
        acc[p.provider_name] = p;
        return acc;
      },
      {},
    ) || {};

  // Build provider lookup by id for rendering clients
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

  return (
    <div className="flex max-w-xl flex-col gap-6 p-4">
      <div className="flex flex-col gap-4">
        <SectionHeading>Auth Clients</SectionHeading>

        {!hasClients && !showAddFlow && (
          <EmptyState onAddClient={() => setShowAddFlow(true)} />
        )}

        {hasClients && (
          <div className="flex flex-col gap-2">
            {clients.map((client) => {
              const provider = providersById[client.provider_id];
              const providerName = provider?.provider_name || 'unknown';
              return (
                <ClientItem
                  key={
                    client.id === lastCreatedClientId
                      ? `${client.id}-last`
                      : client.id
                  }
                  app={app}
                  client={client}
                  providerName={providerName}
                  onUpdateClient={handleUpdateClient}
                  onDeleteClient={handleDeleteClient}
                  defaultOpen={client.id === lastCreatedClientId}
                />
              );
            })}
          </div>
        )}

        {(hasClients || showAddFlow) && (
          <AddClientFlow
            key={showAddFlow ? 'adding' : 'idle'}
            app={app}
            providers={providersByName}
            usedClientNames={usedClientNames}
            onAddProvider={handleAddProvider}
            onAddClient={handleAddClient}
            onCancel={() => setShowAddFlow(false)}
            defaultOpen={showAddFlow}
          />
        )}
      </div>

      <Divider />

      <AuthorizedOrigins
        app={app}
        origins={data.authorized_redirect_origins || []}
        onAddOrigin={handleAddOrigin}
        onRemoveOrigin={handleRemoveOrigin}
      />

      <Divider />

      <Email app={app} />
    </div>
  );
}

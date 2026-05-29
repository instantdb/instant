import { ErrorMessage, Loading } from '@/components/dash/shared';
import config from '@/lib/config';
import { ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { encode } from 'querystring';
import Link from 'next/link';

import {
  Button,
  Content,
  Dialog,
  Divider,
  Label,
  SectionHeading,
  SubsectionHeading,
  useDialog,
} from '@/components/ui';
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
import {
  Email,
  substituteSampleVars,
  DEFAULT_MAGIC_CODE_SUBJECT,
} from './auth/Email';
import { TestUsers } from './auth/TestUsers';
import { GitHubClient, AddGitHubClientForm } from './auth/GitHub';
import { GoogleClient, AddGoogleClientForm } from './auth/Google';
import { LinkedInClient, AddLinkedInClientForm } from './auth/LinkedIn';
import { AuthorizedOrigins } from './auth/Origins';
import { FirebaseClient, AddFirebaseClientForm } from './auth/Firebase';
import { addProvider, deleteClient } from './auth/shared';
import { TokenContext } from '@/lib/contexts';
import { errorToast } from '@/lib/toast';
import { messageFromInstantError } from '@/lib/errors';
import { InstantIssue } from '@instantdb/core';
import { useReadyRouter } from '../clientOnlyPage';

import Image from 'next/image';
import googleIconSvg from '../../public/img/google_g.svg';
import appleLogoSvg from '../../public/img/apple_logo_black.svg';
import githubIconSvg from '../../public/img/github.svg';
import linkedinIconSvg from '../../public/img/linkedin.svg';
import clerkLogoSvg from '../../public/img/clerk_logo_black.svg';
import firebaseLogoSvg from '../../public/img/firebase_auth.svg';
import {
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/solid';

type ProviderType =
  | 'google'
  | 'apple'
  | 'github'
  | 'linkedin'
  | 'clerk'
  | 'firebase';

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

function providerConfig(providerName: string) {
  return PROVIDER_CONFIG[providerName as ProviderType] as
    | (typeof PROVIDER_CONFIG)[ProviderType]
    | undefined;
}

// Query param helpers. We keep the rest of the dashboard params (app, org, tab)
// intact and only toggle the auth drill-in params, which are mutually exclusive.
const AUTH_VIEW_PARAMS = ['client', 'addClient', 'authView'];

// Sentinel value for the `addClient` param that shows the inline provider
// picker (vs. a provider type, which opens that provider's add form).
const ADD_CLIENT_PICKER = 'new';

function authHref(
  router: ReturnType<typeof useReadyRouter>,
  set?: { key: string; value: string },
) {
  const params = new URLSearchParams(encode(router.query));
  for (const key of AUTH_VIEW_PARAMS) {
    params.delete(key);
  }
  if (set) {
    params.set(set.key, set.value);
  }
  return `${router.pathname}?${params.toString()}`;
}

function authLandingHref(router: ReturnType<typeof useReadyRouter>) {
  return authHref(router);
}

function clientHref(
  router: ReturnType<typeof useReadyRouter>,
  clientId: string,
) {
  return authHref(router, { key: 'client', value: clientId });
}

function addClientHref(
  router: ReturnType<typeof useReadyRouter>,
  providerType: ProviderType,
) {
  return authHref(router, { key: 'addClient', value: providerType });
}

function pickerHref(router: ReturnType<typeof useReadyRouter>) {
  return authHref(router, { key: 'addClient', value: ADD_CLIENT_PICKER });
}

function authViewHref(router: ReturnType<typeof useReadyRouter>, view: string) {
  return authHref(router, { key: 'authView', value: view });
}

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
      className="flex cursor-pointer flex-col items-center gap-2 rounded-sm border p-4 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:bg-neutral-700"
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
    <div className="flex flex-col gap-3 rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-center justify-between">
        <Label>Choose a provider</Label>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PROVIDER_ORDER.map((providerType) => (
          <ProviderPickerButton
            key={providerType}
            providerType={providerType}
            onClick={() => onSelect(providerType)}
          />
        ))}
      </div>
    </div>
  );
}

// Renders the provider-specific add form. The provider is created before we get
// here, so it's always defined.
function AddClientForm({
  providerType,
  app,
  provider,
  usedClientNames,
  onAddProvider,
  onAddClient,
  onCancel,
}: {
  providerType: ProviderType;
  app: InstantApp;
  provider: OAuthServiceProvider | undefined;
  usedClientNames: Set<string>;
  onAddProvider: (provider: OAuthServiceProvider) => void;
  onAddClient: (client: OAuthClient) => void;
  onCancel: () => void;
}) {
  if (!provider) {
    return null;
  }

  switch (providerType) {
    case 'google':
      return (
        <AddGoogleClientForm
          app={app}
          provider={provider}
          onAddClient={onAddClient}
          onCancel={onCancel}
          usedClientNames={usedClientNames}
        />
      );
    case 'apple':
      return (
        <AddAppleClientForm
          app={app}
          provider={provider}
          onAddProvider={onAddProvider}
          onAddClient={onAddClient}
          onCancel={onCancel}
          usedClientNames={usedClientNames}
        />
      );
    case 'github':
      return (
        <AddGitHubClientForm
          app={app}
          provider={provider}
          onAddClient={onAddClient}
          onCancel={onCancel}
          usedClientNames={usedClientNames}
        />
      );
    case 'linkedin':
      return (
        <AddLinkedInClientForm
          app={app}
          provider={provider}
          onAddClient={onAddClient}
          onCancel={onCancel}
          usedClientNames={usedClientNames}
        />
      );
    case 'clerk':
      return (
        <AddClerkClientForm
          app={app}
          provider={provider}
          onAddClient={onAddClient}
          onCancel={onCancel}
          usedClientNames={usedClientNames}
        />
      );
    case 'firebase':
      return (
        <AddFirebaseClientForm
          app={app}
          provider={provider}
          onAddClient={onAddClient}
          onCancel={onCancel}
          usedClientNames={usedClientNames}
        />
      );
    default:
      return null;
  }
}

// Renders the provider-specific client detail body (credentials, redirect URLs,
// example code). Delete lives in the shared ClientDetail header.
function ClientItem({
  app,
  client,
  providerName,
  onUpdateClient,
}: {
  app: InstantApp;
  client: OAuthClient;
  providerName: string;
  onUpdateClient: (client: OAuthClient) => void;
}) {
  switch (providerName) {
    case 'google':
      return (
        <GoogleClient
          app={app}
          client={client}
          onUpdateClient={onUpdateClient}
        />
      );
    case 'apple':
      return <AppleClient client={client} />;
    case 'github':
      return (
        <GitHubClient
          app={app}
          client={client}
          onUpdateClient={onUpdateClient}
        />
      );
    case 'linkedin':
      return (
        <LinkedInClient
          app={app}
          client={client}
          onUpdateClient={onUpdateClient}
        />
      );
    case 'clerk':
      return (
        <ClerkClient
          app={app}
          client={client}
          onUpdateClient={onUpdateClient}
        />
      );
    case 'firebase':
      return <FirebaseClient app={app} client={client} />;
    default:
      return null;
  }
}

function AuthBackLink() {
  const router = useReadyRouter();
  return (
    <Link
      href={authLandingHref(router)}
      className="flex items-center gap-1 self-start text-sm text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-white"
    >
      <ChevronLeftIcon height={14} /> Back to auth methods
    </Link>
  );
}

// Shared shell for every auth view. The top slot is always the same height, so
// content sits at the same vertical position whether or not a back link shows.
function AuthLayout({
  showBack,
  maxWidth = 'max-w-2xl',
  children,
}: {
  showBack: boolean;
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className={`mx-auto flex w-full ${maxWidth} flex-col gap-6 p-4`}>
      <div className="flex h-5 items-center">
        {showBack ? <AuthBackLink /> : null}
      </div>
      {children}
    </div>
  );
}

function AuthDetailLayout({
  title,
  description,
  wide = false,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <AuthLayout showBack maxWidth={wide ? 'max-w-5xl' : 'max-w-2xl'}>
      <div className="flex flex-col gap-1">
        <SectionHeading>{title}</SectionHeading>
        {description ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </AuthLayout>
  );
}

// A top-level section header: title plus a one-line description. This is where
// the page's primary hierarchy lives, so every section gets the same treatment.
function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <SectionHeading>{title}</SectionHeading>
      <p className="text-sm text-gray-500 dark:text-neutral-400">
        {description}
      </p>
    </div>
  );
}

function ClientRow({
  client,
  providerName,
  href,
}: {
  client: OAuthClient;
  providerName: string;
  href: string;
}) {
  const cfg = providerConfig(providerName);
  const label = cfg?.label ?? providerName;
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-neutral-800"
    >
      <div className="flex items-center gap-3">
        {cfg ? (
          <Image
            alt={`${label} logo`}
            src={cfg.icon}
            width={20}
            height={20}
            className={cfg.darkInvert ? 'dark:invert' : ''}
          />
        ) : null}
        <span className="font-medium">{client.client_name}</span>
        <span className="text-sm text-gray-400 dark:text-neutral-500">
          {label}
        </span>
      </div>
      <ChevronRightIcon
        height={18}
        className="text-gray-300 dark:text-neutral-600"
      />
    </Link>
  );
}

function ClientDetail({
  app,
  client,
  providerName,
  onUpdateClient,
  onDeleteClient,
}: {
  app: InstantApp;
  client: OAuthClient;
  providerName: string;
  onUpdateClient: (client: OAuthClient) => void;
  onDeleteClient: (client: OAuthClient) => void;
}) {
  const token = useContext(TokenContext);
  const deleteDialog = useDialog();
  const [isDeleting, setIsDeleting] = useState(false);
  const cfg = providerConfig(providerName);
  const label = cfg?.label ?? providerName;

  // Some providers (e.g. Google) tag the platform on the client. Surface it as
  // a pill next to the name so the provider body doesn't have to repeat it.
  const appType =
    typeof client.meta?.appType === 'string' ? client.meta.appType : null;
  const appTypeLabel =
    appType === 'ios'
      ? 'iOS'
      : appType === 'button-for-web'
        ? 'Web button'
        : appType
          ? appType[0].toUpperCase() + appType.slice(1)
          : null;

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const resp = await deleteClient({
        token,
        appId: app.id,
        clientDatabaseId: client.id,
      });
      onDeleteClient(resp.client);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) || 'Error deleting client.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AuthDetailLayout title={`${label} client`}>
      <div className="flex items-center justify-between gap-3 rounded-sm border px-4 py-3 dark:border-neutral-700">
        <div className="flex items-center gap-3">
          {cfg ? (
            <Image
              alt={`${label} logo`}
              src={cfg.icon}
              width={20}
              height={20}
              className={cfg.darkInvert ? 'dark:invert' : ''}
            />
          ) : null}
          <span className="font-medium">{client.client_name}</span>
          {appTypeLabel ? (
            <span className="rounded-full border px-2 py-0.5 text-xs text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
              {appTypeLabel}
            </span>
          ) : null}
          {client.use_shared_credentials ? (
            <span className="rounded-full border px-2 py-0.5 text-xs text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
              Instant dev keys
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={deleteDialog.onOpen}
          className="cursor-pointer text-sm text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
        >
          Delete
        </button>
      </div>

      <ClientItem
        app={app}
        client={client}
        providerName={providerName}
        onUpdateClient={onUpdateClient}
      />

      <Dialog title="Delete client" {...deleteDialog}>
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Delete {client.client_name}</SubsectionHeading>
          <Content>
            Deleting this client will prevent users from logging in with it.
            Make sure you've removed any references to it in your code first.
          </Content>
          <Button
            loading={isDeleting}
            variant="destructive"
            onClick={handleDelete}
          >
            Delete client
          </Button>
        </div>
      </Dialog>
    </AuthDetailLayout>
  );
}

function AddClientView({
  app,
  providerType,
  providers,
  usedClientNames,
  onAddProvider,
  onAddClient,
}: {
  app: InstantApp;
  providerType: ProviderType;
  providers: Record<string, OAuthServiceProvider>;
  usedClientNames: Set<string>;
  onAddProvider: (provider: OAuthServiceProvider) => void;
  onAddClient: (client: OAuthClient) => void;
}) {
  const router = useReadyRouter();
  const token = useContext(TokenContext);
  const provider = providers[providerType];
  const creatingRef = useRef(false);

  // The provider record must exist before we can add a client to it. It's
  // missing the first time you add a client for a given provider, so create it
  // on the fly.
  useEffect(() => {
    if (provider || creatingRef.current) {
      return;
    }
    creatingRef.current = true;
    addProvider({ token, appId: app.id, providerName: providerType })
      .then((resp) => {
        onAddProvider(resp.provider);
      })
      .catch((e) => {
        console.error(e);
        const msg =
          messageFromInstantError(e as InstantIssue) ||
          `There was an error setting up ${PROVIDER_CONFIG[providerType].label}.`;
        errorToast(msg, { autoClose: 5000 });
        router.push(authLandingHref(router));
      })
      .finally(() => {
        creatingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, providerType]);

  return (
    <AuthDetailLayout
      title={`Add ${PROVIDER_CONFIG[providerType].label} client`}
    >
      {provider ? (
        <AddClientForm
          providerType={providerType}
          app={app}
          provider={provider}
          usedClientNames={usedClientNames}
          onAddProvider={onAddProvider}
          onAddClient={onAddClient}
          onCancel={() => router.push(authLandingHref(router))}
        />
      ) : (
        <Loading />
      )}
    </AuthDetailLayout>
  );
}

function EmptyState({ onAddClient }: { onAddClient: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-sm border border-dashed px-6 py-10 text-center dark:border-neutral-700">
      <div className="flex items-center gap-3">
        {PROVIDER_ORDER.slice(0, 5).map((providerType) => (
          <Image
            key={providerType}
            alt={`${PROVIDER_CONFIG[providerType].label} icon`}
            src={PROVIDER_CONFIG[providerType].icon}
            width={24}
            height={24}
            className={
              PROVIDER_CONFIG[providerType].darkInvert ? 'dark:invert' : ''
            }
          />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <div className="font-semibold dark:text-white">
          No social logins yet
        </div>
        <p className="mx-auto max-w-xs text-sm text-gray-500 dark:text-neutral-400">
          Add a provider to let users sign in with their existing accounts.
        </p>
      </div>
      <Button onClick={onAddClient} variant="primary">
        <PlusIcon height={14} /> Add client
      </Button>
    </div>
  );
}

export function AppAuth({
  app,
}: {
  app: InstantApp;
  nav: (p: { s: string; t?: string; app?: string }) => void;
}) {
  const router = useReadyRouter();
  const authResponse = useAuthedFetch<AppsAuthResponse>(
    `${config.apiURI}/dash/apps/${app.id}/auth`,
  );

  // Query-param navigation keeps scroll position, so reset to the top whenever
  // we move between the landing and a drill-in view.
  const drillKey =
    (typeof router.query.client === 'string' && router.query.client) ||
    (typeof router.query.addClient === 'string' && router.query.addClient) ||
    (typeof router.query.authView === 'string' && router.query.authView) ||
    'landing';
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [drillKey]);

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
    authResponse.mutate({
      ...data,
      oauth_clients: [client, ...(data.oauth_clients || [])],
    });
    // Replace so the transient add form isn't left behind in history. Land on
    // the new client's detail view, where the setup instructions live.
    router.replace(clientHref(router, client.id));
  };

  const handleDeleteClient = (client: OAuthClient) => {
    authResponse.mutate({
      ...data,
      oauth_clients: (data.oauth_clients || []).filter(
        (c) => c.id !== client.id,
      ),
    });
    router.replace(authLandingHref(router));
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

  // Build provider lookups by name (for adding) and by id (for rendering).
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

  // Drill-in views, driven by the URL.
  const focusedClientId =
    typeof router.query.client === 'string' ? router.query.client : null;
  const focusedClient = focusedClientId
    ? clients.find((c) => c.id === focusedClientId)
    : undefined;
  const addClientParam =
    typeof router.query.addClient === 'string' ? router.query.addClient : null;
  const addClientProvider =
    addClientParam && PROVIDER_ORDER.includes(addClientParam as ProviderType)
      ? (addClientParam as ProviderType)
      : null;
  // Any non-provider `addClient` value (e.g. the picker sentinel) shows the
  // inline provider picker on the landing page.
  const showPicker = addClientParam != null && addClientProvider == null;
  const authView =
    typeof router.query.authView === 'string' ? router.query.authView : null;

  if (focusedClient) {
    const provider = providersById[focusedClient.provider_id];
    return (
      <ClientDetail
        app={app}
        client={focusedClient}
        providerName={provider?.provider_name || 'unknown'}
        onUpdateClient={handleUpdateClient}
        onDeleteClient={handleDeleteClient}
      />
    );
  }

  if (addClientProvider) {
    return (
      <AddClientView
        app={app}
        providerType={addClientProvider}
        providers={providersByName}
        usedClientNames={usedClientNames}
        onAddProvider={handleAddProvider}
        onAddClient={handleAddClient}
      />
    );
  }

  if (authView === 'magic-email') {
    // The editor seeds its form from the template once, at mount. Key it on the
    // saved sender fields so it re-seeds if that data arrives or changes after
    // mount, instead of sticking on a stale (e.g. empty) first snapshot.
    const t = app.magic_code_email_template;
    const emailFormKey = `${t?.id ?? 'new'}:${t?.email ?? ''}:${t?.name ?? ''}`;
    return (
      <AuthDetailLayout
        title="Magic code email"
        description="The email your users receive with their sign-in code."
      >
        <Email key={emailFormKey} app={app} />
      </AuthDetailLayout>
    );
  }

  return (
    <AuthLayout showBack={false}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="Social login"
            description="Let users sign in with Google, Apple, GitHub, and other providers."
          />

          {showPicker ? (
            <ProviderPicker
              onSelect={(providerType) =>
                router.replace(addClientHref(router, providerType))
              }
              onCancel={() => router.replace(authLandingHref(router))}
            />
          ) : hasClients ? (
            <div className="divide-y overflow-hidden rounded-sm border dark:divide-neutral-700 dark:border-neutral-700">
              {clients.map((client) => {
                const provider = providersById[client.provider_id];
                const providerName = provider?.provider_name || 'unknown';
                return (
                  <ClientRow
                    key={client.id}
                    client={client}
                    providerName={providerName}
                    href={clientHref(router, client.id)}
                  />
                );
              })}
              <button
                type="button"
                onClick={() => router.push(pickerHref(router))}
                className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <PlusIcon height={14} /> Add client
              </button>
            </div>
          ) : (
            <EmptyState onAddClient={() => router.push(pickerHref(router))} />
          )}
        </div>

        <AuthorizedOrigins
          app={app}
          origins={data.authorized_redirect_origins || []}
          onAddOrigin={handleAddOrigin}
          onRemoveOrigin={handleRemoveOrigin}
        />
      </div>

      <Divider />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="Magic codes"
            description="Customize the email with the one-time sign-in code users receive."
          />

          <Link
            href={authViewHref(router, 'magic-email')}
            className="flex items-center justify-between gap-3 rounded-sm border px-4 py-3 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            <div className="flex min-w-0 flex-col gap-0.5 text-sm">
              <div className="flex gap-2">
                <span className="w-14 shrink-0 text-gray-400 dark:text-neutral-500">
                  From
                </span>
                <span className="truncate text-gray-600 dark:text-neutral-300">
                  {app.magic_code_email_template?.name || app.title}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="w-14 shrink-0 text-gray-400 dark:text-neutral-500">
                  Subject
                </span>
                <span className="truncate font-medium">
                  {substituteSampleVars(
                    app.magic_code_email_template?.subject ??
                      DEFAULT_MAGIC_CODE_SUBJECT,
                    app,
                  )}
                </span>
              </div>
            </div>
            <ChevronRightIcon
              height={18}
              className="text-gray-300 dark:text-neutral-600"
            />
          </Link>
        </div>

        <TestUsers app={app} />
      </div>
    </AuthLayout>
  );
}

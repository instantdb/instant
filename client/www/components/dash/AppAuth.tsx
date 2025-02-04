import { useState } from 'react';
import config from '@/lib/config';
import { Loading, ErrorMessage } from '@/components/dash/shared';

import {
  InstantApp,
  AppsAuthResponse,
  AuthorizedOrigin,
  OAuthServiceProvider,
  OAuthClient,
  DashResponse,
} from '@/lib/types';
import { Button, Divider, SectionHeading } from '@/components/ui';
import { APIResponse, useAuthedFetch } from '@/lib/auth';

import { AddGoogleProviderForm, GoogleClients } from './auth/Google';
import { AddClerkProviderForm, ClerkClients } from './auth/Clerk';
import { AppleClients } from './auth/Apple';
import { Email } from './auth/Email';
import { AuthorizedOrigins } from './auth/Origins';

export function AppAuth({
  app,
  dashResponse,
  nav,
}: {
  app: InstantApp;
  dashResponse: APIResponse<DashResponse>;
  nav: (p: { s: string; t?: string; app?: string }) => void;
}) {
  const authResponse = useAuthedFetch<AppsAuthResponse>(
    `${config.apiURI}/dash/apps/${app.id}/auth`,
  );

  // Used to know if we should open the client details by default
  const [lastCreatedClientId, setLastCreatedClientId] = useState<null | string>(
    null,
  );

  // Used to know if we should open the provider details by default
  const [lastCreatedProviderId, setLastCreatedProviderId] = useState<
    null | string
  >(null);

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
    setLastCreatedProviderId(provider.id);
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

  const googleProvider = data.oauth_service_providers?.find(
    (p) => p.provider_name === 'google',
  );

  const clerkProvider = data.oauth_service_providers?.find(
    (p) => p.provider_name === 'clerk',
  );

  const usedClientNames = new Set<string>();
  for (const client of data.oauth_clients || []) {
    usedClientNames.add(client.client_name);
  }

  return (
    <div className="flex flex-col p-4 gap-6 max-w-xl">
      <div className="flex flex-col gap-4">
        <SectionHeading>Google Clients</SectionHeading>

        {googleProvider ? (
          <GoogleClients
            // Set key because setLastCreatedProviderId is somehow applied after mutate
            key={
              lastCreatedProviderId === googleProvider.id
                ? `${googleProvider.id}-last`
                : googleProvider.id
            }
            app={app}
            provider={googleProvider}
            clients={
              data.oauth_clients?.filter(
                (c) => c.provider_id === googleProvider.id,
              ) || []
            }
            onAddClient={handleAddClient}
            onDeleteClient={handleDeleteClient}
            usedClientNames={usedClientNames}
            lastCreatedClientId={lastCreatedClientId}
            defaultOpen={lastCreatedProviderId === googleProvider.id}
          />
        ) : (
          <AddGoogleProviderForm app={app} onAddProvider={handleAddProvider} />
        )}

        <Divider />
        <SectionHeading>Clerk Clients</SectionHeading>

        {clerkProvider ? (
          <ClerkClients
            // Set key because setLastCreatedProviderId is somehow applied after mutate
            key={
              lastCreatedProviderId === clerkProvider.id
                ? `${clerkProvider.id}-last`
                : clerkProvider.id
            }
            app={app}
            provider={clerkProvider}
            clients={
              data.oauth_clients?.filter(
                (c) => c.provider_id === clerkProvider.id,
              ) || []
            }
            onAddClient={handleAddClient}
            onDeleteClient={handleDeleteClient}
            usedClientNames={usedClientNames}
            lastCreatedClientId={lastCreatedClientId}
            defaultOpen={lastCreatedProviderId === clerkProvider.id}
          />
        ) : (
          <AddClerkProviderForm app={app} onAddProvider={handleAddProvider} />
        )}

        <Divider />
        <SectionHeading>Apple Clients</SectionHeading>

        <AppleClients
          app={app}
          data={data}
          onAddProvider={handleAddProvider}
          onAddClient={handleAddClient}
          onDeleteClient={handleDeleteClient}
          usedClientNames={usedClientNames}
          lastCreatedClientId={lastCreatedClientId}
        />
      </div>

      <Divider />

      <AuthorizedOrigins
        app={app}
        origins={data.authorized_redirect_origins || []}
        onAddOrigin={handleAddOrigin}
        onRemoveOrigin={handleRemoveOrigin}
      />

      <Divider />

      <Email app={app} dashResponse={dashResponse} nav={nav} />
    </div>
  );
}

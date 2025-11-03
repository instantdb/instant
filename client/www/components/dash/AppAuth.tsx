import { ErrorMessage, Loading } from '@/components/dash/shared';
import config from '@/lib/config';
import { useState } from 'react';

import { Button, Divider, SectionHeading } from '@/components/ui';
import { useAuthedFetch } from '@/lib/auth';
import {
  AppsAuthResponse,
  AuthorizedOrigin,
  InstantApp,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';

import { AppleClients } from './auth/Apple';
import { AddClerkProviderForm, ClerkClients } from './auth/Clerk';
import { Email } from './auth/Email';
import { AddGitHubProviderForm, GitHubClients } from './auth/GitHub';
import { AddGoogleProviderForm, GoogleClients } from './auth/Google';
import { AddLinkedInProviderForm, LinkedInClients } from './auth/LinkedIn';
import { AuthorizedOrigins } from './auth/Origins';
import { AddFirebaseProviderForm, FirebaseClients } from './auth/Firebase';

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

  const { google, github, linkedin, clerk, firebase } =
    data.oauth_service_providers?.reduce(
      (acc: { [name: string]: OAuthServiceProvider }, p) => {
        acc[p.provider_name] = p;
        return acc;
      },
      {},
    ) || {};

  const usedClientNames = new Set<string>();
  for (const client of data.oauth_clients || []) {
    usedClientNames.add(client.client_name);
  }

  return (
    <div className="flex max-w-xl flex-col gap-6 p-4">
      <div className="flex flex-col gap-4">
        <SectionHeading>Google Clients</SectionHeading>

        {google ? (
          <GoogleClients
            // Set key because setLastCreatedProviderId is somehow applied after mutate
            key={
              lastCreatedProviderId === google.id
                ? `${google.id}-last`
                : google.id
            }
            app={app}
            provider={google}
            clients={
              data.oauth_clients?.filter((c) => c.provider_id === google.id) ||
              []
            }
            onAddClient={handleAddClient}
            onDeleteClient={handleDeleteClient}
            usedClientNames={usedClientNames}
            lastCreatedClientId={lastCreatedClientId}
            defaultOpen={lastCreatedProviderId === google.id}
          />
        ) : (
          <AddGoogleProviderForm app={app} onAddProvider={handleAddProvider} />
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

        <Divider />
        <SectionHeading>GitHub Clients</SectionHeading>

        {github ? (
          <GitHubClients
            key={
              lastCreatedProviderId === github.id
                ? `${github.id}-last`
                : github.id
            }
            app={app}
            provider={github}
            clients={
              data.oauth_clients?.filter((c) => c.provider_id === github.id) ||
              []
            }
            onAddClient={handleAddClient}
            onDeleteClient={handleDeleteClient}
            usedClientNames={usedClientNames}
            lastCreatedClientId={lastCreatedClientId}
            defaultOpen={lastCreatedProviderId === github.id}
          />
        ) : (
          <AddGitHubProviderForm app={app} onAddProvider={handleAddProvider} />
        )}

        <Divider />
        <SectionHeading>LinkedIn Clients</SectionHeading>

        {linkedin ? (
          <LinkedInClients
            key={
              lastCreatedProviderId === linkedin.id
                ? `${linkedin.id}-last`
                : linkedin.id
            }
            app={app}
            provider={linkedin}
            clients={
              data.oauth_clients?.filter(
                (c) => c.provider_id === linkedin.id,
              ) || []
            }
            onAddClient={handleAddClient}
            onDeleteClient={handleDeleteClient}
            usedClientNames={usedClientNames}
            lastCreatedClientId={lastCreatedClientId}
            defaultOpen={lastCreatedProviderId === linkedin.id}
          />
        ) : (
          <AddLinkedInProviderForm
            app={app}
            onAddProvider={handleAddProvider}
          />
        )}
      </div>

      <Divider />
      <SectionHeading>Clerk Clients</SectionHeading>

      {clerk ? (
        <ClerkClients
          // Set key because setLastCreatedProviderId is somehow applied after mutate
          key={
            lastCreatedProviderId === clerk.id ? `${clerk.id}-last` : clerk.id
          }
          app={app}
          provider={clerk}
          clients={
            data.oauth_clients?.filter((c) => c.provider_id === clerk.id) || []
          }
          onAddClient={handleAddClient}
          onUpdateClient={handleUpdateClient}
          onDeleteClient={handleDeleteClient}
          usedClientNames={usedClientNames}
          lastCreatedClientId={lastCreatedClientId}
          defaultOpen={lastCreatedProviderId === clerk.id}
        />
      ) : (
        <AddClerkProviderForm app={app} onAddProvider={handleAddProvider} />
      )}

      <Divider />
      <SectionHeading>Firebase Clients</SectionHeading>

      {firebase ? (
        <FirebaseClients
          // Set key because setLastCreatedProviderId is somehow applied after mutate
          key={
            lastCreatedProviderId === firebase.id
              ? `${firebase.id}-last`
              : firebase.id
          }
          app={app}
          provider={firebase}
          clients={
            data.oauth_clients?.filter((c) => c.provider_id === firebase.id) ||
            []
          }
          onAddClient={handleAddClient}
          onDeleteClient={handleDeleteClient}
          usedClientNames={usedClientNames}
          lastCreatedClientId={lastCreatedClientId}
          defaultOpen={lastCreatedProviderId === firebase.id}
        />
      ) : (
        <AddFirebaseProviderForm app={app} onAddProvider={handleAddProvider} />
      )}

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

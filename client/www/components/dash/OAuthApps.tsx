import {
  SectionHeading,
  Button,
  SubsectionHeading,
  TextInput,
  Divider,
  Dialog,
  Copyable,
} from '@/components/ui';
import { friendlyErrorMessage, useAuthedFetch } from '@/lib/auth';
import { messageFromInstantError } from '@/lib/errors';
import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import {
  InstantError,
  OAuthApp,
  OAuthAppClient,
  OAuthAppClientSecret,
  OAuthAppsResponse,
} from '@/lib/types';

import { FormEventHandler, useContext, useState } from 'react';
import { Loading, ErrorMessage } from '@/components/dash/shared';
import { errorToast } from '@/lib/toast';

import { PlusIcon } from '@heroicons/react/24/solid';

function Client({ client }: { client: OAuthAppClient }) {
  return (
    <div>
      <div>{client.clientName}</div>
    </div>
  );
}

function Clients({ clients }: { clients: OAuthAppClient[] }) {
  return (
    <div>
      {clients.map((c) => (
        <Client key={c.clientId} client={c} />
      ))}
    </div>
  );
}

function AuthorizedRedirectUrlsInput({
  urls,
  onAdd,
  onRemove,
}: {
  urls: string[];
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  return <div>URLs input</div>;
}

function CreateClientForm({
  appId,
  oauthAppId,
  onClose,
  onCreateClient,
}: {
  appId: string;
  oauthAppId: string;
  onClose: () => void;
  onCreateClient: (resp: {
    client: OAuthAppClient;
    clientSecret: OAuthAppClientSecret;
    secretValue: string;
  }) => void;
}) {
  const token = useContext(TokenContext);
  const [clientName, setClientName] = useState('');

  const [authorizedRedirectUrls, setAuthorizedRedirectUrls] = useState<
    string[]
  >([]);

  const [isLoading, setIsLoading] = useState(false);

  const onAddUrl = (s: string) => {
    setAuthorizedRedirectUrls([...authorizedRedirectUrls, s]);
  };

  const onRemoveUrl = (s: string) => {
    setAuthorizedRedirectUrls(authorizedRedirectUrls.filter((x) => x === s));
  };

  const validationError = () => {
    if (!clientName.trim()) {
      return 'Unique name is missing.';
    }
  };

  const onSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const err = validationError();
    if (err) {
      errorToast(err, { autoClose: 5000 });
      return;
    }

    try {
      setIsLoading(true);
      const resp = await jsonFetch(
        `${config.apiURI}/dash/apps/${appId}/oauth-apps/${oauthAppId}/clients`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            client_name: clientName,
            authorized_redirect_urls: authorizedRedirectUrls,
          }),
        },
      );
      if (!resp.client) {
        throw new Error('Missing client in response.');
      }
      onCreateClient(resp);
      onClose();
    } catch (e) {
      // XXX: better error
      console.error(e);
      errorToast('There was an error creating the OAuth client', {
        autoClose: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 p-4 rounted border"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <SubsectionHeading>Create a new Client</SubsectionHeading>
      <TextInput
        value={clientName}
        onChange={setClientName}
        label="Unique name"
        placeholder="Unique name"
        required={true}
      />
      <AuthorizedRedirectUrlsInput
        urls={authorizedRedirectUrls}
        onAdd={onAddUrl}
        onRemove={onRemoveUrl}
      />
      <Button loading={isLoading} type="submit">
        Add OAuth Client
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </form>
  );
}

function CreateClient({
  appId,
  oauthAppId,
  onCreateClient,
  defaultOpen,
}: {
  appId: string;
  oauthAppId: string;
  onCreateClient: (resp: {
    client: OAuthAppClient;
    clientSecret: OAuthAppClientSecret;
    secretValue: string;
  }) => void;
  defaultOpen: boolean;
}) {
  const [showForm, setShowForm] = useState(defaultOpen);

  if (!showForm) {
    return (
      <Button variant="secondary" onClick={() => setShowForm(true)}>
        <PlusIcon height={14} /> Create Client
      </Button>
    );
  }

  return (
    <CreateClientForm
      appId={appId}
      oauthAppId={oauthAppId}
      onCreateClient={onCreateClient}
      onClose={() => setShowForm(false)}
    />
  );
}

function App({
  app,
  onCreateClient,
}: {
  app: OAuthApp;
  onCreateClient: (resp: {
    client: OAuthAppClient;
    clientSecret: OAuthAppClientSecret;
    secretValue: string;
  }) => void;
}) {
  return (
    <div>
      <SubsectionHeading>{app.appName}</SubsectionHeading>
      {app.clients ? <Clients clients={app.clients} /> : null}
      <CreateClient
        appId={app.appId}
        oauthAppId={app.id}
        defaultOpen={(app.clients?.length || 0) === 0}
        onCreateClient={onCreateClient}
      />
    </div>
  );
}

function Apps({
  apps,
  onCreateClient,
}: {
  apps: OAuthApp[];
  onCreateClient: (resp: {
    client: OAuthAppClient;
    clientSecret: OAuthAppClientSecret;
    secretValue: string;
  }) => void;
}) {
  if (!apps.length) {
    return;
  }
  return (
    <div className="flex flex-col gap-6 max-w-xl">
      {apps.map((a) => (
        <div className="flex flex-col gap-4">
          <App key={a.id} app={a} onCreateClient={onCreateClient} />
          <Divider />
        </div>
      ))}
    </div>
  );
}

function AuthorizedDomainsInput({
  domains,
  onAdd,
  onRemove,
}: {
  domains: string[];
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
}) {
  return <div>Domains input</div>;
}

function CreateAppForm({
  appId,
  onClose,
  onCreateApp,
}: {
  appId: string;
  onClose: () => void;
  onCreateApp: (oauthApp: OAuthApp) => void;
}) {
  const token = useContext(TokenContext);
  const [appName, setAppName] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [authorizedDomains, setAuthorizedDomains] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const onAddDomain = (s: string) => {
    setAuthorizedDomains([...authorizedDomains, s]);
  };

  const onRemoveDomain = (s: string) => {
    setAuthorizedDomains(authorizedDomains.filter((x) => x === s));
  };

  const validationError = () => {
    if (!appName.trim()) {
      return 'Unique name is missing.';
    }
  };

  const onSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const err = validationError();
    if (err) {
      errorToast(err, { autoClose: 5000 });
      return;
    }

    try {
      setIsLoading(true);
      const resp = await jsonFetch(
        `${config.apiURI}/dash/apps/${appId}/oauth-apps`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            app_id: appId,
            app_name: appName,
            authorized_domains: authorizedDomains,
            app_homepage: homepageUrl,
            // XXX: rest of fields
          }),
        },
      );
      if (!resp.app) {
        throw new Error('Missing app in response.');
      }
      onCreateApp(resp.app);
      onClose();
    } catch (e) {
      // XXX: better error
      console.error(e);
      errorToast('There was an error creating the OAuth app', {
        autoClose: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 p-4 rounted border"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <SubsectionHeading>Create a new OAuth App</SubsectionHeading>
      <TextInput
        value={appName}
        onChange={setAppName}
        label="Unique name"
        placeholder="Unique name"
        required={true}
      />
      <TextInput
        value={homepageUrl}
        onChange={setHomepageUrl}
        label="Homepage URL"
        placeholder="Your homepage, e.g. https://example.com"
      />
      <AuthorizedDomainsInput
        domains={authorizedDomains}
        onAdd={onAddDomain}
        onRemove={onRemoveDomain}
      />
      {/* XXX: Add privacy policy link */}
      {/* XXX: Add TOS link */}
      {/* XXX: Add logo */}
      <Button loading={isLoading} type="submit">
        Add OAuth App
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </form>
  );
}

function CreateApp({
  appId,
  onCreateApp,
}: {
  appId: string;
  onCreateApp: (app: OAuthApp) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  if (!showForm) {
    return (
      <Button variant="secondary" onClick={() => setShowForm(true)}>
        <PlusIcon height={14} /> Create OAuth App
      </Button>
    );
  }

  return (
    <CreateAppForm
      appId={appId}
      onCreateApp={onCreateApp}
      onClose={() => setShowForm(false)}
    />
  );
}

function OAuthApps({ appId }: { appId: string }) {
  const [secretToCopy, setSecretToCopy] = useState<{
    clientId: string;
    clientSecret: string;
  } | null>(null);
  const authResponse = useAuthedFetch<OAuthAppsResponse>(
    `${config.apiURI}/dash/apps/${appId}/oauth-apps`,
  );

  if (authResponse.isLoading) {
    return <Loading />;
  }

  const handleCreateApp = (app: OAuthApp) => {
    authResponse.mutate({
      ...data,
      apps: [app, ...(data?.apps || [])],
    });
  };

  const handleCreateClient = ({
    client,
    clientSecret,
    secretValue,
  }: {
    client: OAuthAppClient;
    clientSecret: OAuthAppClientSecret;
    secretValue: string;
  }) => {
    const oauthAppId = client.oauthAppId;
    authResponse.mutate({
      ...data,
      apps: (data?.apps || []).map((a) => {
        if (a.id !== oauthAppId) {
          return a;
        }
        return {
          ...a,
          clients: [
            { ...client, secrets: [clientSecret] },
            ...(a.clients || []),
          ],
        };
      }),
    });
    setSecretToCopy({ clientId: client.clientId, clientSecret: secretValue });
  };

  const data = authResponse.data;

  if (!data) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-2">
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

  return (
    <div className="flex flex-col p-4 gap-4 max-w-md">
      {secretToCopy ? (
        <Dialog
          open={Boolean(secretToCopy)}
          onClose={() => setSecretToCopy(null)}
        >
          <div>
            Copy the secret {secretToCopy.clientId} {secretToCopy.clientSecret}
          </div>
          <div>
            <Copyable value={secretToCopy.clientId} label="Client Id" />
          </div>
          <div>
            <Copyable
              value={secretToCopy.clientSecret}
              label="Client secret"
              defaultHidden={true}
            />
          </div>
        </Dialog>
      ) : null}
      <Apps apps={data.apps} onCreateClient={handleCreateClient} />
      <CreateApp appId={appId} onCreateApp={handleCreateApp} />
    </div>
  );
}

export default function Page({ appId }: { appId: string }) {
  return (
    <div className="flex flex-col p-4 gap-4 max-w-md">
      <SectionHeading>OAuth Apps</SectionHeading>
      <OAuthApps appId={appId} />
    </div>
  );
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

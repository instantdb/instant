import {
  SectionHeading,
  Button,
  SubsectionHeading,
  TextInput,
  Divider,
  Dialog,
  Copyable,
  Label,
  Content,
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

import { FormEventHandler, useContext, useEffect, useState } from 'react';
import { Loading, ErrorMessage } from '@/components/dash/shared';
import { errorToast } from '@/lib/toast';

import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';

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
      <img className="w-12 h-12" src={app.appLogo} />
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [authorizedDomains, setAuthorizedDomains] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (logoFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setLogoDataUrl(e.target?.result as string);
      };
      reader.onerror = (e) => {
        console.error(e);
        errorToast('There was an error loading the image.');
        setLogoFile(null);
      };
      reader.readAsDataURL(logoFile);
      return () => reader.abort();
    }
  }, [logoFile]);

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
            app_logo: logoDataUrl,
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
      <Label>App Logo</Label>
      <Content className="text-sm">
        Choose a square, static image less than 1mb.
      </Content>

      {logoDataUrl ? (
        /* n.b. if you change the dimensions here, make sure to also
           change them in pages/platform/oauth/start.tsx (and make sure
           they work with all existing images) */
        <div className="w-12 h-12 relative">
          <div className="absolute w-full h-full group">
            <div className="hidden group-hover:block transition duration-300 w-full h-full place-content-center text-center bg-black/50">
              <Button
                variant="destructive"
                size="mini"
                className="p-0 m-0 bg-transparent border-none"
                onClick={() => {
                  setLogoFile(null);
                  setLogoDataUrl(null);
                }}
              >
                <TrashIcon height="1.5em" />
              </Button>
            </div>
          </div>
          <img className="w-12 h-12" src={logoDataUrl} />
        </div>
      ) : (
        <div className="flex place-content-center w-12 h-12 bg-gray-100 border-dashed border-2 border-gray-400 rounded-lg items-center text-center cursor-pointer">
          <input
            id="upload"
            type="file"
            className="hidden"
            accept="image/*"
            multiple={false}
            onChange={(e: React.ChangeEvent<any>) => {
              setLogoDataUrl(null);
              const file = e.target.files[0];
              if (!file) {
                setLogoFile(null);
                return;
              }

              if (file.size > 1024 * 1024) {
                errorToast('Image should be less than 1mb.');
                return;
              }

              if (
                ![
                  'image/jpeg',
                  'image/jpg',
                  'image/png',
                  'image/svg',
                  'image/webp',
                ].includes(file.type)
              ) {
                errorToast(
                  'Image type should be either png, svg, webp, or jpeg',
                );
                return;
              }

              setLogoFile(file);
            }}
          />
          <label htmlFor="upload" className="cursor-pointer">
            {logoFile ? (
              <ArrowPathIcon height={'1em'} className="m-auto animate-spin" />
            ) : (
              <ArrowUpTrayIcon height={'1em'} className="m-auto" />
            )}

            <span
              id="filename"
              className="text-gray-500 bg-gray-200 z-50"
            ></span>
          </label>
        </div>
      )}

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

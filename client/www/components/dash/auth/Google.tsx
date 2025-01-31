import { FormEventHandler, useState, useContext } from 'react';
import { errorToast } from '@/lib/toast';
import { TokenContext } from '@/lib/contexts';
import { InstantApp, InstantError, OAuthClient, OAuthServiceProvider } from '@/lib/types';
import { addProvider, addClient, deleteClient, findName } from './shared';
import { messageFromInstantError } from '@/lib/auth';
import { Button, Checkbox, Content, Copyable, Copytext, Dialog, Divider, Fence, SectionHeading, SubsectionHeading, TextInput, useDialog } from '@/components/ui';
import Image from 'next/image';
import googleIconSvg from '../../../public/img/google_g.svg';
import * as Collapsible from '@radix-ui/react-collapsible';
import { PlusIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid';

export function AddClientForm({
  app,
  provider,
  onAddClient,
  onCancel,
  usedClientNames,
}: {
  app: InstantApp;
  provider: OAuthServiceProvider;
  onAddClient: (client: OAuthClient) => void;
  onCancel: () => void;
  usedClientNames: Set<string>;
}) {
  const token = useContext(TokenContext);
  const [clientName, setClientName] = useState<string>(() => findName('google', usedClientNames));
  const [clientId, setClientId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [updatedRedirectURL, setUpdatedRedirectURL] = useState(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const validationError = () => {
    if (!clientName) {
      return 'Missing unique name';
    }
    if (usedClientNames.has(clientName)) {
      return `The unique name '${clientName}' is already in use.`;
    }
    if (!clientId) {
      return 'Missing client id';
    }
    if (!clientSecret) {
      return 'Missing client secret';
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
      const resp = await addClient({
        token,
        appId: app.id,
        providerId: provider.id,
        clientName,
        clientId,
        clientSecret,
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        discoveryEndpoint: 'https://accounts.google.com/.well-known/openid-configuration',
      });
      onAddClient(resp.client);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantError) || 'Error creating client.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 p-4 rounded border"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <SubsectionHeading>Add a new Google client</SubsectionHeading>
      <TextInput
        tabIndex={1}
        value={clientName}
        onChange={setClientName}
        label="Client name"
        placeholder="e.g. google-web"
      />
      <TextInput
        tabIndex={2}
        value={clientId}
        onChange={setClientId}
        label={
          <>
            Client ID from{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferer"
              href="https://console.developers.google.com/apis/credentials"
            >
              Google console
            </a>
          </>
        }
        placeholder=""
      />
      <TextInput
        type="sensitive"
        tabIndex={3}
        value={clientSecret}
        onChange={setClientSecret}
        label={
          <>
            Client secret from{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferer"
              href="https://console.developers.google.com/apis/credentials"
            >
              Google console
            </a>
          </>
        }
      />
      <div className="rounded border p-4 flex flex-col gap-2 bg-gray-50">
        <p className="overflow-hidden">
          Add{' '}
          <Copytext value="https://api.instantdb.com/runtime/oauth/callback" />{' '}
          to the "Authorized redirect URIs" on your{' '}
          <a
            className="underline"
            target="_blank"
            rel="noopener noreferer"
            href={
              clientId
                ? `https://console.cloud.google.com/apis/credentials/oauthclient/${clientId}`
                : 'https://console.developers.google.com/apis/credentials'
            }
          >
            Google OAuth client
          </a>
          .
        </p>
        <Checkbox
          checked={updatedRedirectURL}
          onChange={setUpdatedRedirectURL}
          label="I added the redirect to Google"
        />
      </div>
      <Button loading={isLoading} type="submit">
        Add client
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

export function AddGoogleProviderForm({
  app,
  onAddProvider,
}: {
  app: InstantApp;
  onAddProvider: (provider: OAuthServiceProvider) => void;
}) {
  const token = useContext(TokenContext);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const addGoogleProvider = async () => {
    setIsLoading(true);
    try {
      const resp = await addProvider({
        token,
        appId: app.id,
        providerName: 'google',
      });
      onAddProvider(resp.provider);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantError) ||
        'There was an error setting up Google.';
      errorToast(msg, { autoClose: 5000 });
      // report error
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div>
      <Button
        loading={isLoading}
        variant="secondary"
        onClick={addGoogleProvider}
      >
        <span className="flex items-center space-x-2">
          <Image alt="google icon" src={googleIconSvg} />
          <span>Setup Google</span>
        </span>
      </Button>
    </div>
  );
}

export function Client({
  app,
  client,
  onDeleteClient,
  defaultOpen = false,
}: {
  app: InstantApp;
  client: OAuthClient;
  onDeleteClient: (client: OAuthClient) => void;
  defaultOpen?: boolean;
}) {
  const token = useContext(TokenContext);
  const [open, setOpen] = useState(defaultOpen);
  const [isLoading, setIsLoading] = useState(false);
  const deleteDialog = useDialog();

  const handleDelete = async () => {
    try {
      setIsLoading(true);
      const resp = await deleteClient({
        token,
        appId: app.id,
        clientDatabaseId: client.id,
      });
      onDeleteClient(resp.client);
      deleteDialog.onClose();
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantError) || 'Error deleting client.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  const exampleCode = `// create the authorization URL:
const url = db.auth.createAuthorizationURL({
  clientName: "${client.client_name}",
  redirectURL: window.location.href,
});

// Create a link with the url
<a href={url}>Log in with Google</a>`;

  return (
    <div className="">
      <Collapsible.Root
        open={open}
        onOpenChange={setOpen}
        className="flex flex-col border rounded"
      >
        <Collapsible.Trigger className="flex p-4 hover:bg-gray-100 bg-gray-50">
          <div className="flex flex-1 justify-between items-center">
            <div className="flex gap-2">
              {' '}
              <Image alt="google logo" src={googleIconSvg} />
              <SectionHeading>
                {client.client_name}{' '}
                <span className="text-gray-400">(Google)</span>
              </SectionHeading>
            </div>
            {open ? (
              <ChevronDownIcon height={24} />
            ) : (
              <ChevronUpIcon height={24} />
            )}
          </div>
        </Collapsible.Trigger>
        <Collapsible.Content className="">
          <div className="p-4 flex flex-col gap-4 border-t">
            <Copyable label="Client name" value={client.client_name} />
            <Copyable label="Google client ID" value={client.client_id || ''} />
            <SubsectionHeading>
              <a className="underline" href="/docs/auth/google-auth">Setup and usage</a>
            </SubsectionHeading>
            <Content>
              <strong>1.</strong> Navigate to{' '}
              <a
                className="underline"
                href={`https://console.cloud.google.com/apis/credentials/oauthclient/${client.client_id}`}
                target="_blank"
                rel="noopener noreferer"
              >
                Google OAuth client
              </a>{' '}
              and add Instant's redirect URL under "Authorized redirect URIs
            </Content>
            <Copyable
              label="Redirect URI"
              value="https://api.instantdb.com/runtime/oauth/callback"
            />
            <Content>
              <strong>2.</strong> Use the code below to generate a login link in
              your app.
            </Content>

            <div className="border rounded p-4 text-sm overflow-auto">
              <Fence code={exampleCode} language="typescript" />
            </div>

            <Divider />

            <div>
              <Button
                onClick={deleteDialog.onOpen}
                loading={isLoading}
                variant="destructive"
              >
                Delete client
              </Button>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
      <Dialog {...deleteDialog}>
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Delete client</SubsectionHeading>
          <Content>
            Deleting the client will prevent users from using this client to log
            in to your app. Be sure that you've removed any reference to it in
            your code before deleting.
          </Content>
          <Button
            loading={isLoading}
            variant="destructive"
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

// We should eventually have a generic component for any provider,
// but we'll start with just Google for now to keep things simple
export function GoogleClients({
  app,
  provider,
  clients,
  onAddClient,
  onDeleteClient,
  usedClientNames,
  lastCreatedClientId,
  defaultOpen,
}: {
  app: InstantApp;
  provider: OAuthServiceProvider;
  clients: OAuthClient[];
  onAddClient: (client: OAuthClient) => void;
  onDeleteClient: (client: OAuthClient) => void;
  usedClientNames: Set<string>;
  lastCreatedClientId: string | null;
  defaultOpen: boolean;
}) {
  const [showAddClientForm, setShowAddClientForm] =
    useState<boolean>(defaultOpen);

  const handleAddClient = (client: OAuthClient) => {
    setShowAddClientForm(false);
    onAddClient(client);
  };

  return (
    <div className="flex flex-col gap-2">
      {clients.map((c) => {
        return (
          <Client
            // Update the key because the mutate somehow takes effect before
            // lastCreatedClientId is set--this causes it to re-evaluate defaultOpen
            key={c.id === lastCreatedClientId ? `${c.id}-last` : c.id}
            app={app}
            client={c}
            onDeleteClient={onDeleteClient}
            defaultOpen={c.id === lastCreatedClientId}
          />
        );
      })}

      {showAddClientForm ? (
        <>
          <AddClientForm
            app={app}
            provider={provider}
            onAddClient={handleAddClient}
            onCancel={() => setShowAddClientForm(false)}
            usedClientNames={usedClientNames}
          />
        </>
      ) : (
        <Button onClick={() => setShowAddClientForm(true)} variant="secondary">
          <PlusIcon height={14} /> Add {clients.length > 0 ? 'another ' : ''}Google client
        </Button>
      )}
    </div>
  );
}
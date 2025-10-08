import { FormEventHandler, useContext, useState } from 'react';
import Image from 'next/image';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/solid';

import {
  Button,
  Content,
  Copyable,
  Copytext,
  Dialog,
  Divider,
  Fence,
  SectionHeading,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { TokenContext } from '@/lib/contexts';
import {
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';
import { addProvider, addClient, deleteClient, findName } from './shared';
import { errorToast } from '@/lib/toast';
import { messageFromInstantError } from '@/lib/errors';

import linkedinIconSvg from '../../../public/img/linkedin.svg';

function exampleCode({
  appId,
  clientName,
}: {
  appId: string;
  clientName: string;
}) {
  return /* js */ `// Create the authorization URL:
const url = db.auth.createAuthorizationURL({
  clientName: "${clientName}",
  redirectURL: window.location.href,
});

// Create a link with the url
<a href={url}>Log in with LinkedIn</a>
`;
}

export function AddLinkedInProviderForm({
  app,
  onAddProvider,
}: {
  app: InstantApp;
  onAddProvider: (provider: OAuthServiceProvider) => void;
}) {
  const token = useContext(TokenContext);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const addLinkedInProvider = async () => {
    setIsLoading(true);
    try {
      const resp = await addProvider({
        token,
        appId: app.id,
        providerName: 'linkedin',
      });
      onAddProvider(resp.provider);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) ||
        'There was an error setting up LinkedIn.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <Button
        loading={isLoading}
        variant="secondary"
        onClick={addLinkedInProvider}
      >
        <span className="flex items-center space-x-2">
          <Image alt="linkedin icon" src={linkedinIconSvg} width={16} />
          <span>Setup LinkedIn</span>
        </span>
      </Button>
    </div>
  );
}

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
  const [clientName, setClientName] = useState<string>(() =>
    findName('linkedin-web', usedClientNames),
  );
  const [clientId, setClientId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
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
        authorizationEndpoint:
          'https://www.linkedin.com/oauth/v2/authorization',
        tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
        discoveryEndpoint:
          'https://www.linkedin.com/oauth/.well-known/openid-configuration',
      });
      onAddClient(resp.client);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) || 'Error creating client.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 rounded border p-4 dark:border dark:border-neutral-700"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <SubsectionHeading>Add a new LinkedIn client</SubsectionHeading>
      <TextInput
        tabIndex={1}
        value={clientName}
        onChange={setClientName}
        label="Client name"
        placeholder="e.g. linkedin-web"
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
              href="https://www.linkedin.com/developers/apps"
            >
              LinkedIn developer portal
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
              href="https://www.linkedin.com/developers/apps"
            >
              LinkedIn developer portal
            </a>
          </>
        }
      />

      <div className="flex flex-col gap-2 rounded border bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <p className="overflow-hidden">
          Add{' '}
          <Copytext value="https://api.instantdb.com/runtime/oauth/callback" />{' '}
          as a redirect URI for your LinkedIn app.
        </p>
        <p className="text-sm text-gray-500">
          LinkedIn requires exact matches for redirect URLs. Make sure the URI
          above is added in the "Authorized redirect URLs" section of your app
          configuration.
        </p>
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
        messageFromInstantError(e as InstantIssue) || 'Error deleting client.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col">
      <Collapsible.Root
        open={open}
        onOpenChange={setOpen}
        className="flex flex-col rounded border"
      >
        <Collapsible.Trigger className="flex bg-gray-50 p-4 hover:bg-gray-100 dark:bg-neutral-800">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex gap-2">
              {' '}
              <Image alt="google logo" src={linkedinIconSvg} />
              <SectionHeading>
                {client.client_name}{' '}
                <span className="text-gray-400">(LinkedIn)</span>
              </SectionHeading>
            </div>
            {open ? (
              <ChevronUpIcon height={24} />
            ) : (
              <ChevronDownIcon height={24} />
            )}
          </div>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <div className="flex flex-col gap-4 border-t p-4">
            <Copyable label="Client name" value={client.client_name} />
            <Copyable
              label="LinkedIn client ID"
              value={client.client_id || ''}
            />

            <SubsectionHeading>
              <a
                className="font-bold underline"
                target="_blank"
                href="/docs/auth/linkedin-oauth"
              >
                Setup and usage
              </a>
            </SubsectionHeading>
            <Content>
              <strong>1.</strong> Add the redirect URI below to your LinkedIn
              application.
            </Content>
            <Copyable
              label="Redirect URI"
              value="https://api.instantdb.com/runtime/oauth/callback"
            />
            <Content>
              <strong>2.</strong> Use the code below to generate a login link in
              your app.
            </Content>
            <div className="overflow-auto rounded border text-sm">
              <Fence
                code={exampleCode({
                  appId: app.id,
                  clientName: client.client_name,
                })}
                language="typescript"
              />
            </div>

            <Divider />
            <Button
              onClick={deleteDialog.onOpen}
              loading={isLoading}
              variant="destructive"
            >
              Delete client
            </Button>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
      <Dialog {...deleteDialog}>
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Delete client</SubsectionHeading>
          <Content>
            Deleting the client will prevent users from signing in with this
            LinkedIn configuration. Make sure you have removed any references to
            it in your code before deleting.
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

export function LinkedInClients({
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
    <div className="flex flex-col gap-2 bg-white dark:bg-neutral-800">
      {clients.map((c) => (
        <Client
          key={c.id === lastCreatedClientId ? `${c.id}-last` : c.id}
          app={app}
          client={c}
          onDeleteClient={onDeleteClient}
          defaultOpen={c.id === lastCreatedClientId}
        />
      ))}

      {showAddClientForm ? (
        <AddClientForm
          app={app}
          provider={provider}
          onAddClient={handleAddClient}
          onCancel={() => setShowAddClientForm(false)}
          usedClientNames={usedClientNames}
        />
      ) : (
        <Button onClick={() => setShowAddClientForm(true)} variant="secondary">
          <PlusIcon height={14} /> Add {clients.length > 0 ? 'another ' : ''}
          LinkedIn client
        </Button>
      )}
    </div>
  );
}

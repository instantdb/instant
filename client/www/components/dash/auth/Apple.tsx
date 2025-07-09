import { FormEventHandler, useContext, useState } from 'react';
import { errorToast } from '@/lib/toast';
import { TokenContext } from '@/lib/contexts';
import {
  Button,
  Content,
  Copyable,
  Dialog,
  SectionHeading,
  SubsectionHeading,
  TextInput,
  TextArea,
  useDialog,
} from '@/components/ui';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/solid';
import logo from '../../../public/img/apple_logo_black.svg';
import Image from 'next/image';
import { messageFromInstantError } from '@/lib/errors';
import { addProvider, addClient, deleteClient, findName } from './shared';
import {
  AppsAuthResponse,
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';

export function AppleClient({
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
              <Image alt="apple logo" src={logo} />
              <SectionHeading>
                {client.client_name}{' '}
                <span className="text-gray-400">(Apple)</span>
              </SectionHeading>
            </div>
            {open ? (
              <ChevronUpIcon height={24} />
            ) : (
              <ChevronDownIcon height={24} />
            )}
          </div>
        </Collapsible.Trigger>
        <Collapsible.Content className="">
          <div className="p-4 flex flex-col gap-4 border-t">
            <Copyable label="Client Name" value={client.client_name} />

            <Copyable label="Services ID" value={client.client_id || ''} />

            {client.meta?.teamId ? (
              <Copyable label="Team ID" value={client.meta?.teamId} />
            ) : null}

            {client.meta?.keyId ? (
              <Copyable label="Key ID" value={client.meta?.keyId} />
            ) : null}

            <a
              className="underline"
              href="/docs/auth/apple"
              target="_blank"
              rel="noopener noreferer"
            >
              Setup and Usage
            </a>

            <div>
              <Button
                onClick={deleteDialog.onOpen}
                loading={isLoading}
                variant="destructive"
              >
                Delete
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

export function AddClientExpanded({
  app,
  provider,
  onAddProvider,
  onAddClient,
  onCancel,
  usedClientNames,
}: {
  app: InstantApp;
  provider: OAuthServiceProvider | undefined;
  onAddProvider: (provider: OAuthServiceProvider) => void;
  onAddClient: (client: OAuthClient) => void;
  onCancel: () => void;
  usedClientNames: Set<string>;
}) {
  const token = useContext(TokenContext);

  const [clientName, setClientName] = useState<string>(() =>
    findName('apple', usedClientNames),
  );
  const [servicesId, setServicesId] = useState<string>('');
  const [teamId, setTeamId] = useState<string>('');
  const [keyId, setKeyId] = useState<string>('');
  const [privateKey, setPrivateKey] = useState<string>('');
  const [redirectOpen, setRedirectOpen] = useState(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const validationError = () => {
    if (!clientName) {
      return 'Missing client name';
    }
    if (usedClientNames.has(clientName)) {
      return `Client name '${clientName}' is already in use.`;
    }
    if (!servicesId) {
      return 'Missing Apple Services ID';
    }
    if ((teamId || keyId || privateKey) && !(teamId && keyId && privateKey)) {
      return 'All of Team ID, Key ID, and Private Key are required for Web redirect flow.';
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

      if (!provider) {
        const resp = await addProvider({
          token,
          appId: app.id,
          providerName: 'apple',
        });
        provider = resp.provider;
        onAddProvider(resp.provider);
      }

      const resp = await addClient({
        token,
        appId: app.id,
        providerId: provider.id,
        clientName,
        clientId: servicesId,
        clientSecret: privateKey || undefined,
        authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
        tokenEndpoint: 'https://appleid.apple.com/auth/token',
        discoveryEndpoint:
          'https://account.apple.com/.well-known/openid-configuration',
        meta: {
          teamId,
          keyId,
        },
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
      className="flex flex-col gap-2 p-4 rounded border"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <SubsectionHeading>Add Apple Client</SubsectionHeading>
      <TextInput
        tabIndex={1}
        value={clientName}
        onChange={setClientName}
        label="Client Name"
        placeholder="e.g. apple"
      />
      <TextInput
        tabIndex={2}
        value={servicesId}
        onChange={setServicesId}
        label={
          <>
            Services ID from{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferer"
              href="https://developer.apple.com/account/resources/identifiers/list/serviceId"
            >
              Identifiers
            </a>
          </>
        }
        placeholder=""
      />
      <Collapsible.Root
        open={redirectOpen}
        onOpenChange={setRedirectOpen}
        className="flex flex-col border rounded"
      >
        <Collapsible.Trigger className="flex p-4 hover:bg-gray-100 bg-gray-50">
          <div className="flex flex-1 justify-between items-center">
            Redirect flow for Web (optional)
            {redirectOpen ? (
              <ChevronDownIcon height={24} />
            ) : (
              <ChevronUpIcon height={24} />
            )}
          </div>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div className="p-4">
            <TextInput
              tabIndex={3}
              value={teamId}
              onChange={setTeamId}
              label={
                <>
                  Team ID from{' '}
                  <a
                    className="underline"
                    target="_blank"
                    rel="noopener noreferer"
                    href="https://developer.apple.com/account#MembershipDetailsCard"
                  >
                    Membership details
                  </a>
                </>
              }
              placeholder=""
            />
            <TextInput
              tabIndex={4}
              value={keyId}
              onChange={setKeyId}
              label={
                <>
                  Key ID from{' '}
                  <a
                    className="underline"
                    target="_blank"
                    rel="noopener noreferer"
                    href="https://developer.apple.com/account/resources/authkeys/list"
                  >
                    Keys
                  </a>
                </>
              }
              placeholder=""
            />
            <TextArea
              tabIndex={5}
              value={privateKey}
              onChange={setPrivateKey}
              label="Private Key"
              rows={6}
              placeholder={
                '-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----'
              }
            />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
      <Button loading={isLoading} type="submit">
        Add Apple Client
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function AddClient({
  app,
  provider,
  clients,
  onAddProvider,
  onAddClient,
  usedClientNames,
}: {
  app: InstantApp;
  provider: OAuthServiceProvider | undefined;
  clients: OAuthClient[];
  onAddProvider: (provider: OAuthServiceProvider) => void;
  onAddClient: (client: OAuthClient) => void;
  usedClientNames: Set<string>;
}) {
  const [expanded, setExpanded] = useState<boolean>(false);

  if (!expanded) {
    return (
      <Button onClick={() => setExpanded(true)} variant="secondary">
        <PlusIcon height={14} /> Add {clients.length > 0 ? 'another ' : ''}Apple
        Client
      </Button>
    );
  }

  return (
    <AddClientExpanded
      app={app}
      provider={provider}
      onAddProvider={onAddProvider}
      onAddClient={(c) => {
        setExpanded(false);
        onAddClient(c);
      }}
      onCancel={() => setExpanded(false)}
      usedClientNames={usedClientNames}
    />
  );
}

export function AppleClients({
  app,
  data,
  onAddProvider,
  onAddClient,
  onDeleteClient,
  usedClientNames,
  lastCreatedClientId,
}: {
  app: InstantApp;
  data: AppsAuthResponse;
  onAddProvider: (provider: OAuthServiceProvider) => void;
  onAddClient: (client: OAuthClient) => void;
  onDeleteClient: (client: OAuthClient) => void;
  usedClientNames: Set<string>;
  lastCreatedClientId: string | null;
}) {
  const provider = data.oauth_service_providers?.find(
    (p) => p.provider_name === 'apple',
  );
  const clients =
    data.oauth_clients?.filter((c) => c.provider_id === provider?.id) || [];

  return (
    <div className="flex flex-col gap-2">
      {clients.map((c) => (
        <AppleClient
          // Update the key because the mutate somehow takes effect before
          // lastCreatedClientId is set--this causes it to re-evaluate defaultOpen
          key={c.id === lastCreatedClientId ? `${c.id}-last` : c.id}
          app={app}
          client={c}
          onDeleteClient={onDeleteClient}
          defaultOpen={c.id === lastCreatedClientId}
        />
      ))}
      <AddClient
        app={app}
        provider={provider}
        clients={clients}
        onAddProvider={onAddProvider}
        onAddClient={onAddClient}
        usedClientNames={usedClientNames}
      />
    </div>
  );
}

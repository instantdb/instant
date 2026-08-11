import { FormEventHandler, useContext, useState } from 'react';
import { errorToast, successToast } from '@/lib/toast';
import { TokenContext } from '@/lib/contexts';
import { Button, Copyable, TextInput, TextArea } from '@/components/ui';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';
import { messageFromInstantError } from '@/lib/errors';
import { addProvider, addClient, findName, updateClient } from './shared';
import {
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';
import {
  APPLE_AUTHORIZATION_ENDPOINT,
  APPLE_DISCOVERY_ENDPOINT,
  APPLE_TOKEN_ENDPOINT,
} from '@instantdb/platform';

// Editor for an Apple client's credentials. The Services ID, Team ID, and Key
// ID are readable and prefilled; the Private Key is write-only (never returned
// to the dashboard), so leaving it blank keeps the current key. The private key
// and the Team/Key IDs are combined server-side only at web sign-in time, so
// each can be updated independently.
function AppleCredentialsEditor({
  app,
  client,
  onUpdateClient,
}: {
  app: InstantApp;
  client: OAuthClient;
  onUpdateClient: (client: OAuthClient) => void;
}) {
  const token = useContext(TokenContext);
  const [isEditing, setIsEditing] = useState(false);
  const [servicesId, setServicesId] = useState<string>(client.client_id || '');
  const [teamId, setTeamId] = useState<string>(client.meta?.teamId || '');
  const [keyId, setKeyId] = useState<string>(client.meta?.keyId || '');
  const [privateKey, setPrivateKey] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const resetFields = () => {
    setServicesId(client.client_id || '');
    setTeamId(client.meta?.teamId || '');
    setKeyId(client.meta?.keyId || '');
    setPrivateKey('');
  };

  const openEditor = () => {
    resetFields();
    setIsEditing(true);
  };

  const cancel = () => {
    setIsEditing(false);
    resetFields();
  };

  const validationError = () => {
    if (!servicesId) {
      return 'Missing Apple Services ID';
    }
    // Team ID and Key ID are only meaningful together (web redirect flow).
    if ((teamId || keyId) && !(teamId && keyId)) {
      return 'Both Team ID and Key ID are required for the Web redirect flow.';
    }
  };

  const handleSave = async () => {
    const err = validationError();
    if (err) {
      errorToast(err, { autoClose: 5000 });
      return;
    }
    try {
      setIsSaving(true);
      const resp = await updateClient({
        token,
        appId: app.id,
        oauthClientID: client.id,
        body: {
          client_id: servicesId,
          ...(teamId && keyId ? { meta: { teamId, keyId } } : {}),
          ...(privateKey ? { client_secret: privateKey } : {}),
        },
      });
      onUpdateClient(resp.client);
      cancel();
      successToast('Credentials updated');
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) ||
        'Error updating credentials.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="flex flex-col gap-4">
        <Copyable label="Services ID" value={client.client_id || ''} />

        {client.meta?.teamId ? (
          <Copyable label="Team ID" value={client.meta?.teamId} />
        ) : null}

        {client.meta?.keyId ? (
          <Copyable label="Key ID" value={client.meta?.keyId} />
        ) : null}

        <div className="flex justify-end">
          <Button variant="secondary" size="mini" onClick={openEditor}>
            Update credentials
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      autoComplete="off"
      data-lpignore="true"
      data-1p-ignore="true"
      data-bwignore="true"
      data-form-type="other"
    >
      <TextInput
        value={servicesId}
        onChange={setServicesId}
        label={
          <>
            Services ID from{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
              href="https://developer.apple.com/account/resources/identifiers/list/serviceId"
            >
              Identifiers
            </a>
          </>
        }
      />
      <TextInput
        value={teamId}
        onChange={setTeamId}
        label={
          <>
            Team ID from{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
              href="https://developer.apple.com/account#MembershipDetailsCard"
            >
              Membership details
            </a>
          </>
        }
      />
      <TextInput
        value={keyId}
        onChange={setKeyId}
        label={
          <>
            Key ID from{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
              href="https://developer.apple.com/account/resources/authkeys/list"
            >
              Keys
            </a>
          </>
        }
      />
      <TextArea
        value={privateKey}
        onChange={setPrivateKey}
        label="Private Key"
        rows={6}
        placeholder={'-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----'}
      />
      <p className="text-sm text-gray-500 dark:text-neutral-400">
        Leave the private key blank to keep the current one.
      </p>
      <div className="flex gap-2">
        <Button loading={isSaving} type="submit">
          Save
        </Button>
        <Button variant="secondary" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AppleClient({
  app,
  client,
  onUpdateClient,
}: {
  app: InstantApp;
  client: OAuthClient;
  onUpdateClient: (client: OAuthClient) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Copyable label="Client Name" value={client.client_name} />

      <AppleCredentialsEditor
        app={app}
        client={client}
        onUpdateClient={onUpdateClient}
      />

      <a
        className="underline"
        href="/docs/auth/apple"
        target="_blank"
        rel="noopener noreferrer"
      >
        Setup and Usage
      </a>
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
        authorizationEndpoint: APPLE_AUTHORIZATION_ENDPOINT,
        tokenEndpoint: APPLE_TOKEN_ENDPOINT,
        discoveryEndpoint: APPLE_DISCOVERY_ENDPOINT,
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
      className="flex flex-col gap-4"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <TextInput
        tabIndex={1}
        value={clientName}
        onChange={setClientName}
        label="Client Name"
        placeholder="e.g. apple"
        ignorePasswordManager
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
              rel="noopener noreferrer"
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
        className="flex flex-col rounded-sm border dark:border-neutral-700 dark:bg-neutral-800"
      >
        <Collapsible.Trigger className="flex cursor-pointer bg-gray-50 p-4 hover:bg-gray-100 dark:bg-neutral-800 dark:hover:bg-neutral-700">
          <div className="flex flex-1 items-center justify-between">
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
                    rel="noopener noreferrer"
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
                    rel="noopener noreferrer"
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
      <div className="flex gap-2 pt-1">
        <Button loading={isLoading} type="submit">
          Add client
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

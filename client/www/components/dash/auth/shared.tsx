import { useState } from 'react';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import {
  InstantApp,
  InstantIssue,
  OAuthServiceProvider,
  OAuthClient,
} from '@/lib/types';
import { Button, Content, Copytext, Dialog, InfoTip, SubsectionHeading, TextInput, useDialog } from '@/components/ui';
import { errorToast, successToast } from '@/lib/toast';
import { messageFromInstantError } from '@/lib/errors';

export function findName(prefix: string, used: Set<string>): string {
  if (!used.has(prefix)) {
    return prefix;
  }
  for (let i = 2; true; i++) {
    if (!used.has(prefix + i)) {
      return prefix + i;
    }
  }
}

export function addProvider({
  token,
  appId,
  providerName,
}: {
  token: string;
  appId: string;
  providerName: string;
}): Promise<{ provider: OAuthServiceProvider }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth_service_providers`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ provider_name: providerName }),
    },
  );
}

export function addClient({
  token,
  appId,
  providerId,
  clientName,
  clientId,
  clientSecret,
  authorizationEndpoint,
  tokenEndpoint,
  discoveryEndpoint,
  redirectTo,
  meta,
}: {
  token: string;
  appId: string;
  providerId: string;
  clientName: string;
  clientId?: string;
  clientSecret?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  discoveryEndpoint?: string;
  redirectTo?: string;
  meta?: any;
}): Promise<{ client: OAuthClient }> {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/oauth_clients`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      provider_id: providerId,
      client_name: clientName,
      client_id: clientId,
      client_secret: clientSecret,
      authorization_endpoint: authorizationEndpoint,
      token_endpoint: tokenEndpoint,
      discovery_endpoint: discoveryEndpoint,
      redirect_to: redirectTo,
      meta,
    }),
  });
}

export function deleteClient({
  token,
  appId,
  clientDatabaseId,
}: {
  token: string;
  appId: string;
  clientDatabaseId: string;
}): Promise<{ client: OAuthClient }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth_clients/${clientDatabaseId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
}

export function updateClientMeta({
  token,
  appId,
  clientDatabaseId,
  meta,
}: {
  token: string;
  appId: string;
  clientDatabaseId: string;
  meta: Record<string, any>;
}): Promise<{ client: OAuthClient }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth_clients/${clientDatabaseId}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ meta }),
    },
  );
}

export function updateClientRedirectTo({
  token,
  appId,
  clientDatabaseId,
  redirectTo,
}: {
  token: string;
  appId: string;
  clientDatabaseId: string;
  redirectTo: string;
}): Promise<{ client: OAuthClient }> {
  return jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth_clients/${clientDatabaseId}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ redirect_to: redirectTo }),
    },
  );
}

function RedirectUrlLabel() {
  return (
    <span className="flex items-center gap-1">
      Custom Redirect URL (optional)
      <InfoTip>
        <div className="max-w-sm space-y-3 p-2 text-sm leading-relaxed text-gray-700 dark:text-neutral-300">
          <p>
            By default, OAuth providers redirect users to Instant's callback
            URL. During this redirect, users see "Redirecting to
            api.instantdb.com..."
          </p>
          <p>
            With a custom redirect URL, users will instead see "Redirecting to
            yoursite.com..." for a more branded experience.
          </p>
          <p>
            Your URL must forward to{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800 dark:bg-neutral-700 dark:text-neutral-200">
              https://api.instantdb.com/runtime/oauth/callback
            </code>{' '}
            with all query parameters preserved.
          </p>
        </div>
      </InfoTip>
    </span>
  );
}

export function RedirectUrlInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextInput
      tabIndex={4}
      value={value}
      onChange={onChange}
      label={<RedirectUrlLabel />}
      placeholder="e.g. https://yoursite.com/oauth/callback"
    />
  );
}

export function TestRedirectButton({ redirectTo }: { redirectTo: string }) {
  const dialog = useDialog();
  const testUrl = `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}test-redirect=true`;

  return (
    <>
      <Button variant="secondary" size="mini" onClick={dialog.onOpen}>
        Test redirect
      </Button>
      <Dialog title="Test Redirect" {...dialog}>
        <div className="flex flex-col gap-4">
          <SubsectionHeading>Test your redirect</SubsectionHeading>
          <Content>
            Let's make sure your redirect is working before you continue.
          </Content>
          <Content>
            <a
              href={testUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Click here to test your redirect
            </a>
          </Content>
          <Content className="text-sm text-gray-500 dark:text-neutral-400">
            If it worked, you should see a page that says your redirect looks good.
          </Content>
          <Button variant="secondary" onClick={dialog.onClose}>
            Done
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function EditableRedirectUrl({
  app,
  client,
  token,
  onUpdateClient,
}: {
  app: InstantApp;
  client: OAuthClient;
  token: string;
  onUpdateClient: (client: OAuthClient) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [redirectTo, setRedirectTo] = useState(client.redirect_to || '');
  const [isSaving, setIsSaving] = useState(false);
  const confirmDialog = useDialog();

  const hasValue = Boolean(client.redirect_to);
  const hasChanged = redirectTo !== (client.redirect_to || '');

  const handleConfirmedSave = async () => {
    try {
      setIsSaving(true);
      const resp = await updateClientRedirectTo({
        token,
        appId: app.id,
        clientDatabaseId: client.id,
        redirectTo: redirectTo || null,
      });
      onUpdateClient(resp.client);
      setIsEditing(false);
      confirmDialog.onClose();
      successToast(redirectTo ? 'Redirect URL updated' : 'Redirect URL cleared');
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) ||
        'Error updating redirect URL.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOrClear = () => {
    if (redirectTo) {
      confirmDialog.onOpen();
    } else {
      handleConfirmedSave();
    }
  };

  const handleCancel = () => {
    setRedirectTo(client.redirect_to || '');
    setIsEditing(false);
  };

  const isClearing = !redirectTo && hasValue;
  const testUrl = redirectTo ? `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}test-redirect=true` : '';

  if (!hasValue && !isEditing) {
    return (
      <div>
        <Button
          variant="secondary"
          size="mini"
          onClick={() => setIsEditing(true)}
        >
          Set custom redirect URL
        </Button>
      </div>
    );
  }

  if (isEditing || hasChanged) {
    return (
      <div className="flex flex-col gap-2">
        <TextInput
          value={redirectTo}
          onChange={setRedirectTo}
          label={<RedirectUrlLabel />}
          placeholder="e.g. https://yoursite.com/oauth/callback"
        />
        <div className="flex gap-2">
          <Button loading={isSaving} onClick={handleSaveOrClear}>
            {isClearing ? 'Clear' : 'Save'}
          </Button>
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
        <Dialog title="Confirm Redirect Setup" {...confirmDialog}>
          <div className="flex flex-col gap-4">
            <SubsectionHeading>Confirm</SubsectionHeading>
            <Content>
              Before we save, let's double-check that your redirect is working.
            </Content>
            <Content>
              <a
                href={testUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Click here to test your redirect
              </a>
            </Content>
            <Content className="text-sm text-gray-500 dark:text-neutral-400">
              If it worked, you should see a page that says your redirect looks good.
            </Content>
            <div className="flex gap-2">
              <Button loading={isSaving} onClick={handleConfirmedSave}>
                Confirm
              </Button>
              <Button variant="secondary" onClick={confirmDialog.onClose}>
                Cancel
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 truncate text-sm text-gray-700 dark:text-neutral-300">
        <span className="font-medium">Custom Redirect URL:</span>{' '}
        <span className="font-mono">{client.redirect_to}</span>
      </div>
      <Button
        variant="secondary"
        size="mini"
        onClick={() => setIsEditing(true)}
      >
        Edit
      </Button>
    </div>
  );
}

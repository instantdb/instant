import { FormEventHandler, useContext, useState } from 'react';

import {
  Button,
  Content,
  Copyable,
  Copytext,
  Fence,
  SectionHeading,
  SubsectionHeading,
  TextInput,
} from '@/components/ui';
import { TokenContext } from '@/lib/contexts';
import {
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';
import {
  addClient,
  findName,
  RedirectUrlInput,
  EditableRedirectUrl,
  RedirectForwardingNote,
} from './shared';
import { errorToast } from '@/lib/toast';
import { messageFromInstantError } from '@/lib/errors';

import { DEFAULT_OAUTH_CALLBACK_URL } from '@instantdb/platform';
import { useDarkMode } from '../DarkModeToggle';

function exampleCode({ clientName }: { clientName: string }) {
  return /* js */ `// Create the authorization URL:
const url = db.auth.createAuthorizationURL({
  clientName: "${clientName}",
  redirectURL: window.location.href,
});

// Create a link with the url
<a href={url}>Log in with GitHub</a>
`;
}

export function AddGitHubClientForm({
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
    findName('github-web', usedClientNames),
  );
  const [clientId, setClientId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [redirectTo, setRedirectTo] = useState<string>('');
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
        redirectTo,
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
        label="Client name"
        placeholder="e.g. github-web"
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
              rel="noopener noreferrer"
              href="https://github.com/settings/developers"
            >
              GitHub OAuth Apps
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
              rel="noopener noreferrer"
              href="https://github.com/settings/developers"
            >
              GitHub OAuth Apps
            </a>
          </>
        }
      />

      <RedirectUrlInput value={redirectTo} onChange={setRedirectTo} />

      <div className="flex flex-col gap-2 rounded-sm border bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <p className="overflow-hidden">
          Add <Copytext value={redirectTo || DEFAULT_OAUTH_CALLBACK_URL} /> as
          the Authorization callback URL in your GitHub OAuth App settings.
        </p>
        {redirectTo && <RedirectForwardingNote redirectTo={redirectTo} />}
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          GitHub requires an exact match for the callback URL. Make sure to add
          this URL in your OAuth App's settings on GitHub.
        </p>
      </div>

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

export function GitHubClient({
  app,
  client,
  onUpdateClient,
}: {
  app: InstantApp;
  client: OAuthClient;
  onUpdateClient: (client: OAuthClient) => void;
}) {
  const token = useContext(TokenContext);

  const { darkMode } = useDarkMode();

  return (
    <div className="flex flex-col gap-4">
      <Copyable label="Client name" value={client.client_name} />
      <Copyable label="GitHub Client ID" value={client.client_id || ''} />
      <EditableRedirectUrl
        app={app}
        client={client}
        token={token}
        onUpdateClient={onUpdateClient}
      />

      <SubsectionHeading>
        <a
          className="font-bold underline"
          target="_blank"
          href="/docs/auth/github-oauth"
        >
          Setup and usage
        </a>
      </SubsectionHeading>
      <Content>
        <strong className="dark:text-white">1.</strong> Add the callback URL
        below to your GitHub OAuth App settings.
      </Content>
      <div className="flex flex-col gap-2">
        <Copyable
          label="Authorization callback URL"
          value={client.redirect_to || DEFAULT_OAUTH_CALLBACK_URL}
        />
        {client.redirect_to && (
          <RedirectForwardingNote redirectTo={client.redirect_to} />
        )}
      </div>
      <Content>
        <strong className="dark:text-white">2.</strong> Use the code below to
        generate a login link in your app.
      </Content>
      <div className="overflow-auto rounded-sm border text-sm dark:border-none">
        <Fence
          darkMode={darkMode}
          code={exampleCode({
            clientName: client.client_name,
          })}
          language="typescript"
        />
      </div>
    </div>
  );
}

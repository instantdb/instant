import { FormEventHandler, useState, useContext } from 'react';
import { errorToast, successToast } from '@/lib/toast';
import { TokenContext } from '@/lib/contexts';
import {
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';
import {
  addProvider,
  addClient,
  deleteClient,
  findName,
  RedirectUrlInput,
  EditableRedirectUrl,
  TestRedirectButton,
  updateClient,
} from './shared';
import { messageFromInstantError } from '@/lib/errors';
import {
  Button,
  Checkbox,
  Content,
  Copyable,
  Copytext,
  Dialog,
  Divider,
  Fence,
  SubsectionHeading,
  TextInput,
  useDialog,
  ToggleGroup,
} from '@/components/ui';
import Image from 'next/image';
import { DEFAULT_OAUTH_CALLBACK_URL } from '@instantdb/platform';
import googleIconSvg from '../../../public/img/google_g.svg';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/solid';
import { useDarkMode } from '../DarkModeToggle';

type AppType = 'web' | 'ios' | 'android' | 'button-for-web';
function isNative(appType: AppType) {
  return appType === 'ios' || appType === 'android';
}

export function AddGoogleClientForm({
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
  const [credentialMode, setCredentialMode] = useState<'dev' | 'custom'>('dev');
  const [appType, setAppType] = useState<
    'web' | 'ios' | 'android' | 'button-for-web'
  >('web');
  const useSharedCredentials = appType === 'web' && credentialMode === 'dev';
  const [clientName, setClientName] = useState<string>(() =>
    findName(`google-${appType}`, usedClientNames),
  );
  const [clientId, setClientId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [redirectTo, setRedirectTo] = useState<string>('');
  const [updatedRedirectURL, setUpdatedRedirectURL] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const onChangeAppType = (item: { id: string; label: string }) => {
    const newAppType = item.id as 'web' | 'ios' | 'android' | 'button-for-web';
    setAppType(newAppType);
    setClientName(findName(`google-${newAppType}`, usedClientNames));
  };

  const validationError = () => {
    if (!clientName) {
      return 'Missing unique name';
    }
    if (usedClientNames.has(clientName)) {
      return `The unique name '${clientName}' is already in use.`;
    }
    if (!useSharedCredentials) {
      if (!clientId) {
        return 'Missing client id';
      }
      if (appType === 'web' && !clientSecret) {
        return 'Missing client secret';
      }
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
        clientId: useSharedCredentials ? undefined : clientId,
        clientSecret: useSharedCredentials
          ? undefined
          : clientSecret
            ? clientSecret
            : undefined,
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        discoveryEndpoint:
          'https://accounts.google.com/.well-known/openid-configuration',
        redirectTo: useSharedCredentials ? undefined : redirectTo,
        useSharedCredentials,
        meta: {
          skipNonceChecks: true,
          appType,
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
      className="flex flex-col gap-2 rounded-sm border p-4 dark:border dark:border-neutral-700"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
      data-1p-ignore="true"
      data-bwignore="true"
      data-form-type="other"
    >
      <SubsectionHeading>Add a new Google client</SubsectionHeading>
      <div className="mb-4">
        <label className="mb-2 block text-sm font-bold text-gray-700 dark:text-neutral-400">
          Type
        </label>
        <ToggleGroup
          items={[
            { id: 'web', label: 'Web' },
            { id: 'ios', label: 'iOS' },
            { id: 'android', label: 'Android' },
            { id: 'button-for-web', label: 'Google Button for Web' },
          ]}
          selectedId={appType}
          onChange={onChangeAppType}
          ariaLabel="Application type"
        />
      </div>
      {appType === 'web' && (
        <div className="mb-2">
          <ToggleGroup
            items={[
              { id: 'dev', label: 'Use dev credentials' },
              { id: 'custom', label: 'Use my own' },
            ]}
            selectedId={credentialMode}
            onChange={({ id }) => setCredentialMode(id as 'dev' | 'custom')}
            ariaLabel="Credential mode"
          />
        </div>
      )}
      <TextInput
        tabIndex={1}
        value={clientName}
        onChange={setClientName}
        label="Client name"
        placeholder={`e.g. google-${appType}`}
      />

      {useSharedCredentials ? (
        <div className="rounded-sm bg-gray-50 p-3 text-sm text-gray-600 dark:bg-neutral-800 dark:text-neutral-400">
          <p>
            Instant provides dev credentials so you can test Google sign-in in
            development without any setup.
          </p>
          <button
            type="button"
            className="mt-2 text-blue-600 hover:underline dark:text-blue-400"
            onClick={() => setCredentialMode('custom')}
          >
            Ready for production? Add your own credentials
          </button>
        </div>
      ) : (
        <>
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
                  href="https://console.developers.google.com/apis/credentials"
                >
                  Google console
                </a>
              </>
            }
            placeholder=""
          />

          {appType === 'web' && (
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
                    href="https://console.developers.google.com/apis/credentials"
                  >
                    Google console
                  </a>
                </>
              }
            />
          )}
          {appType === 'web' && (
            <RedirectUrlInput value={redirectTo} onChange={setRedirectTo} />
          )}
          {appType === 'web' && (
            <div className="flex flex-col gap-2 rounded-sm border bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
              <p className="overflow-hidden">
                Add{' '}
                <Copytext value={redirectTo || DEFAULT_OAUTH_CALLBACK_URL} /> to
                the "Authorized redirect URIs" on your{' '}
                <a
                  className="underline dark:text-white"
                  target="_blank"
                  rel="noopener noreferrer"
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
              {redirectTo && (
                <>
                  <p className="text-sm text-gray-500 dark:text-neutral-400">
                    Your redirect URL should forward to{' '}
                    <Copytext value={DEFAULT_OAUTH_CALLBACK_URL} /> with all
                    query parameters.
                  </p>
                  <TestRedirectButton redirectTo={redirectTo} />
                </>
              )}
              <Checkbox
                checked={updatedRedirectURL}
                onChange={setUpdatedRedirectURL}
                label="I added the redirect to Google"
              />
            </div>
          )}
        </>
      )}
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
        messageFromInstantError(e as InstantIssue) ||
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

function appTypeLabel(appType: AppType): string {
  switch (appType) {
    case 'ios':
      return 'iOS';
    default:
      return appType.charAt(0).toUpperCase() + appType.slice(1);
  }
}

function CredentialsEditor({
  app,
  client,
  appType,
  onUpdateClient,
}: {
  app: InstantApp;
  client: OAuthClient;
  appType: AppType;
  onUpdateClient: (client: OAuthClient) => void;
}) {
  const token = useContext(TokenContext);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeClientId, setUpgradeClientId] = useState('');
  const [upgradeClientSecret, setUpgradeClientSecret] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const needsClientSecret = appType === 'web';

  const cancelUpgrade = () => {
    setShowUpgrade(false);
    setUpgradeClientId('');
    setUpgradeClientSecret('');
  };

  const handleUpgradeCredentials = async () => {
    if (!upgradeClientId) {
      errorToast('Missing client id', { autoClose: 5000 });
      return;
    }
    if (needsClientSecret && !upgradeClientSecret) {
      errorToast('Missing client secret', { autoClose: 5000 });
      return;
    }
    try {
      setIsLoading(true);
      const resp = await updateClient({
        token,
        appId: app.id,
        oauthClientID: client.id,
        body: {
          client_id: upgradeClientId,
          ...(needsClientSecret && upgradeClientSecret
            ? { client_secret: upgradeClientSecret }
            : {}),
          use_shared_credentials: false,
        },
      });
      onUpdateClient(resp.client);
      cancelUpgrade();
      successToast('Credentials updated');
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) ||
        'Error updating credentials.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  const googleConsoleLink = (
    <a
      className="underline"
      target="_blank"
      rel="noopener noreferrer"
      href="https://console.developers.google.com/apis/credentials"
    >
      Google console
    </a>
  );

  const editForm = (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        handleUpgradeCredentials();
      }}
      autoComplete="off"
      data-lpignore="true"
      data-1p-ignore="true"
      data-bwignore="true"
      data-form-type="other"
    >
      <p className="text-sm text-gray-500 dark:text-neutral-400">
        Find your credentials in the {googleConsoleLink} under "OAuth 2.0 Client
        IDs".
      </p>
      <TextInput
        value={upgradeClientId}
        onChange={setUpgradeClientId}
        label={<>Client ID from {googleConsoleLink}</>}
      />
      {needsClientSecret ? (
        <TextInput
          type="sensitive"
          value={upgradeClientSecret}
          onChange={setUpgradeClientSecret}
          label={<>Client secret from {googleConsoleLink}</>}
        />
      ) : null}
      <div className="flex gap-2">
        <Button loading={isLoading} type="submit">
          Save
        </Button>
        <Button variant="secondary" onClick={cancelUpgrade}>
          Cancel
        </Button>
      </div>
    </form>
  );

  if (client.use_shared_credentials) {
    return (
      <div className="rounded-sm bg-gray-50 p-3 text-sm text-gray-600 dark:bg-neutral-800 dark:text-neutral-400">
        <p>
          Using Instant's dev credentials. Works in development out of the box.
        </p>
        {!showUpgrade ? (
          <div className="mt-2 flex items-center gap-2">
            <span>Ready to go to production?</span>
            <Button
              variant="secondary"
              size="mini"
              onClick={() => setShowUpgrade(true)}
            >
              Set custom credentials
            </Button>
          </div>
        ) : (
          editForm
        )}
      </div>
    );
  }

  return (
    <>
      <Copyable label="Google client ID" value={client.client_id || ''} />
      {!showUpgrade ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="mini"
            onClick={() => setShowUpgrade(true)}
          >
            Update credentials
          </Button>
        </div>
      ) : (
        editForm
      )}
    </>
  );
}

export function GoogleClient({
  app,
  client,
  onDeleteClient,
  onUpdateClient,
  defaultOpen = false,
}: {
  app: InstantApp;
  client: OAuthClient;
  onDeleteClient: (client: OAuthClient) => void;
  onUpdateClient: (client: OAuthClient) => void;
  defaultOpen?: boolean;
}) {
  const token = useContext(TokenContext);
  const [open, setOpen] = useState(defaultOpen);
  const [isLoading, setIsLoading] = useState(false);

  const appType: AppType = client.meta?.appType || 'web';
  const [nativeExampleType, setNativeExampleType] = useState<'rn' | 'web'>(
    appType === 'button-for-web' ? 'web' : 'rn',
  );

  const showNative = isNative(appType) || appType === 'button-for-web';
  const deleteDialog = useDialog();

  const { darkMode } = useDarkMode();

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

  const exampleCode = `// Create the authorization URL:
const url = db.auth.createAuthorizationURL({
  clientName: "${client.client_name}",
  redirectURL: window.location.href,
});

// Create a link with the url
<a href={url}>Log in with Google</a>`;

  const exampleRNCode = `
<GoogleSigninButton
  size={GoogleSigninButton.Size.Wide}
  color={GoogleSigninButton.Color.Dark}
  onPress={async () => {
    // 1. Sign in to Google
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken;

    if (!idToken) {
      console.error("no ID token present!");
      return;
    }
    // 2. Use your token, and sign into InstantDB!
    try {
      const res = await db.auth.signInWithIdToken({
        clientName: "${client.client_name}",
        idToken,
      });
      console.log("logged in!", res);
    } catch (error) {
      console.log("error signing in", error);
    }
    console.log("done");
  }}
/>
  `.trim();

  const exampleGoogleButtonCode = `
import { useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

function Login() {
  const [nonce] = useState(crypto.randomUUID());

  return (
    <GoogleOAuthProvider clientId={"${client.client_id}"}>
      <GoogleLogin
        nonce={nonce}
        onError={() => alert('Login failed')}
        onSuccess={({ credential }) => {
          db.auth
            .signInWithIdToken({
              clientName: "${client.client_name}"
              idToken: credential,
              // Make sure this is the same nonce you passed as a prop
              // to the GoogleLogin button
              nonce,
            })
            .catch((err) => {
              alert('Uh oh: ' + err.body?.message);
            });
        }}
      />
    </GoogleOAuthProvider>
  );
}`.trim();
  return (
    <div className="">
      <Collapsible.Root
        open={open}
        onOpenChange={setOpen}
        className="flex flex-col rounded-sm border dark:border-neutral-700"
      >
        <Collapsible.Trigger className="flex cursor-pointer bg-gray-50 p-4 hover:bg-gray-100 dark:bg-neutral-800 dark:hover:bg-neutral-700">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-2">
              <Image alt="google logo" src={googleIconSvg} />
              <div className="font-medium">
                {client.client_name}{' '}
                <span className="text-gray-400 dark:text-neutral-500">
                  (Google)
                </span>
              </div>
            </div>
            {open ? (
              <ChevronUpIcon height={24} />
            ) : (
              <ChevronDownIcon height={24} />
            )}
          </div>
        </Collapsible.Trigger>
        <Collapsible.Content className="">
          <div className="flex flex-col gap-4 border-t p-4 dark:border-t-neutral-700">
            <div className="">App Type: {appTypeLabel(appType)}</div>

            <Copyable label="Client name" value={client.client_name} />
            <CredentialsEditor
              app={app}
              client={client}
              appType={appType}
              onUpdateClient={onUpdateClient}
            />
            {appType === 'web' && !client.use_shared_credentials && (
              <EditableRedirectUrl
                app={app}
                client={client}
                token={token}
                onUpdateClient={onUpdateClient}
              />
            )}

            {appType === 'web' && (
              <>
                <SubsectionHeading>
                  <a
                    className="font-bold underline"
                    target="_blank"
                    href="/docs/auth/google-oauth"
                  >
                    Setup and usage
                  </a>
                </SubsectionHeading>
                {!client.use_shared_credentials && (
                  <>
                    <Content>
                      <strong className="dark:text-white">1.</strong> Navigate
                      to{' '}
                      <a
                        className="underline dark:text-white"
                        href={`https://console.cloud.google.com/apis/credentials/oauthclient/${client.client_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Google OAuth client
                      </a>{' '}
                      and add the redirect URL under "Authorized redirect URIs"
                    </Content>
                    <Copyable
                      label="Redirect URI"
                      value={client.redirect_to || DEFAULT_OAUTH_CALLBACK_URL}
                    />
                    {client.redirect_to && (
                      <>
                        <Content className="text-sm text-gray-500 dark:text-neutral-400">
                          Your redirect URL should forward to{' '}
                          <Copytext value={DEFAULT_OAUTH_CALLBACK_URL} /> with
                          all query parameters.
                        </Content>
                        <TestRedirectButton redirectTo={client.redirect_to} />
                      </>
                    )}
                  </>
                )}
                <Content>
                  {!client.use_shared_credentials && (
                    <strong className="dark:text-white">2. </strong>
                  )}
                  Use the code below to generate a login link in your app.
                </Content>
                <div className="overflow-auto rounded-sm border text-sm dark:border-none">
                  <Fence
                    darkMode={darkMode}
                    code={exampleCode}
                    language="typescript"
                  />
                </div>
              </>
            )}
            {showNative && (
              <>
                <SubsectionHeading>
                  <a
                    className="font-bold underline"
                    target="_blank"
                    href="/docs/auth/google-oauth?method=react-native"
                  >
                    Setup and usage
                  </a>
                </SubsectionHeading>
                <ToggleGroup
                  items={[
                    { id: 'rn', label: 'React Native' },
                    { id: 'web', label: 'Google Button for Web' },
                  ]}
                  selectedId={nativeExampleType}
                  onChange={({ id }) =>
                    setNativeExampleType(id as 'rn' | 'web')
                  }
                  ariaLabel="Application type"
                />
                {nativeExampleType === 'rn' && (
                  <>
                    <Content>
                      <strong className="dark:text-white">1.</strong> Use the
                      code below to sign in with{' '}
                      <code>@react-native-google-signin/google-signin</code>:
                    </Content>
                    <div className="overflow-auto rounded-sm border text-sm dark:border-none">
                      <Fence
                        darkMode={darkMode}
                        code={exampleRNCode}
                        language="typescript"
                      />
                    </div>
                  </>
                )}
                {nativeExampleType === 'web' && (
                  <>
                    <Content>
                      <strong className="dark:text-white">1.</strong> Use the
                      code below to sign in with{' '}
                      <code>@react-oauth/google</code>:
                    </Content>
                    <div className="overflow-auto rounded-sm border text-sm dark:border-none">
                      <Fence
                        darkMode={darkMode}
                        code={exampleGoogleButtonCode}
                        language="typescript"
                      />
                    </div>
                  </>
                )}
              </>
            )}

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
      <Dialog title="Delete Client" {...deleteDialog}>
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

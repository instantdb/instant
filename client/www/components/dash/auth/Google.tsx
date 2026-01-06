import { FormEventHandler, useState, useContext } from 'react';
import { errorToast } from '@/lib/toast';
import { TokenContext } from '@/lib/contexts';
import {
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';
import { addProvider, addClient, deleteClient, findName } from './shared';
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
  SectionHeading,
  SubsectionHeading,
  TextInput,
  useDialog,
  ToggleGroup,
} from '@/components/ui';
import Image from 'next/image';
import googleIconSvg from '../../../public/img/google_g.svg';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/solid';
import { useDarkMode } from '../DarkModeToggle';

function NonceCheckNotice() {
  return (
    <p className="dark:test-neutral-400 text-sm text-gray-500">
      This option skips nonce checks for ID tokens. This is useful in iOS
      environments, because libraries like `react-native-google-signin` do not
      let you pass a nonce over to google.
    </p>
  );
}

type AppType = 'web' | 'ios' | 'android';
function isNative(appType: AppType) {
  return appType === 'ios' || appType === 'android';
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
  const [appType, setAppType] = useState<'web' | 'ios' | 'android'>('web');
  const [clientName, setClientName] = useState<string>(() =>
    findName(`google-${appType}`, usedClientNames),
  );
  const [clientId, setClientId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [updatedRedirectURL, setUpdatedRedirectURL] = useState(false);
  const [skipNonceChecks, setSkipNonceChecks] = useState(isNative(appType));
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const onChangeAppType = (item: { id: string; label: string }) => {
    const newAppType = item.id as 'web' | 'ios' | 'android';
    setAppType(newAppType);
    setClientName(findName(`google-${newAppType}`, usedClientNames));
    setSkipNonceChecks(isNative(newAppType));
  };

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
    if (appType === 'web' && !clientSecret) {
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
        clientSecret: clientSecret ? clientSecret : undefined,
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        discoveryEndpoint:
          'https://accounts.google.com/.well-known/openid-configuration',
        meta: {
          skipNonceChecks: skipNonceChecks,
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
          ]}
          selectedId={appType}
          onChange={onChangeAppType}
          ariaLabel="Application type"
        />
      </div>
      <TextInput
        tabIndex={1}
        value={clientName}
        onChange={setClientName}
        label="Client name"
        placeholder={`e.g. google-${appType}`}
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
                rel="noopener noreferer"
                href="https://console.developers.google.com/apis/credentials"
              >
                Google console
              </a>
            </>
          }
        />
      )}
      {appType === 'web' && (
        <div className="dark flex flex-col gap-2 rounded-sm border bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
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
      )}
      {isNative(appType) && (
        <div className="flex flex-col gap-2 rounded-sm border bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
          {' '}
          <Checkbox
            checked={skipNonceChecks}
            onChange={setSkipNonceChecks}
            label="Skip nonce checks"
          />
          <NonceCheckNotice />
        </div>
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

  const { darkMode } = useDarkMode();

  const didSkipNonceChecks = client.meta?.skipNonceChecks;
  const appType: AppType = client.meta?.appType || 'web';

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
  return (
    <div className="">
      <Collapsible.Root
        open={open}
        onOpenChange={setOpen}
        className="flex flex-col rounded-sm border dark:border-neutral-700"
      >
        <Collapsible.Trigger className="flex cursor-pointer bg-gray-50 p-4 hover:bg-gray-100 dark:bg-neutral-800">
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
            <Copyable label="Google client ID" value={client.client_id || ''} />

            {didSkipNonceChecks ? (
              <div className="flex flex-col gap-2 rounded-sm border bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
                <Checkbox
                  checked={client.meta?.skipNonceChecks || false}
                  onChange={() => {}}
                  label="Skip nonce checks"
                />
                <NonceCheckNotice />
              </div>
            ) : null}
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
                  and add Instant's redirect URL under "Authorized redirect
                  URIs"
                </Content>
                <Copyable
                  label="Redirect URI"
                  value="https://api.instantdb.com/runtime/oauth/callback"
                />
                <Content>
                  <strong>2.</strong> Use the code below to generate a login
                  link in your app.
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
            {isNative(appType) && (
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
                <Content>
                  <strong>1.</strong> Use the code below to sign in with
                  `react-native-google-signin`:
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
    <div className="flex flex-col gap-2 bg-white dark:bg-neutral-800">
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
          <PlusIcon height={14} /> Add {clients.length > 0 ? 'another ' : ''}
          Google client
        </Button>
      )}
    </div>
  );
}

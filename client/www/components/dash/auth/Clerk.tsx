import { FormEventHandler, useContext, useState } from 'react';
import { errorToast } from '@/lib/toast';
import { TokenContext } from '@/lib/contexts';
import {
  Button,
  Checkbox,
  Content,
  Copyable,
  Dialog,
  Divider,
  Fence,
  SectionHeading,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/solid';
import clerkLogoSvg from '../../../public/img/clerk_logo_black.svg';
import Image from 'next/image';
import {
  messageFromInstantError,
} from '@/lib/auth';
import { addProvider, addClient, deleteClient, findName } from './shared';
import { InstantApp, InstantError, OAuthClient, OAuthServiceProvider } from '@/lib/types';

export function AddClerkProviderForm({
  app,
  onAddProvider,
}: {
  app: InstantApp;
  onAddProvider: (provider: OAuthServiceProvider) => void;
}) {
  const token = useContext(TokenContext);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const addClerkProvider = async () => {
    setIsLoading(true);
    try {
      const resp = await addProvider({
        token,
        appId: app.id,
        providerName: 'clerk',
      });
      onAddProvider(resp.provider);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantError) ||
        'There was an error setting up Clerk.';
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
        onClick={addClerkProvider}
      >
        <span className="flex items-center space-x-2">
          <Image alt="clerk logo" src={clerkLogoSvg} />
          <span>Setup Clerk</span>
        </span>
      </Button>
    </div>
  );
}

// Base64 decode, switching to url-safe decode if we hit an error
// Can't be sure which method Clerk uses because you can't generate
// `+` or `/` with characters that go in a normal host. Urls with
// chinese characters exist, they might encode to `+` or `/`, and
// Clerk might support them, so we'll be safe and do both.
function base64Decode(s: string) {
  try {
    return Buffer.from(s, 'base64').toString('utf-8');
  } catch (e) {
    return Buffer.from(s, 'base64url').toString('utf-8');
  }
}

function domainFromClerkKey(key: string): string | null {
  try {
    const parts = key.split('_');
    const domainPartB64 = parts[parts.length - 1];
    const domainPart = base64Decode(domainPartB64);
    return domainPart.replace('$', '');
  } catch (e) {
    console.error('Error getting domain from clerk key', e);
    return null;
  }
}

function clerkExampleCode({
  appId,
  clientName,
  clerkPublishableKey,
}: {
  appId: string;
  clientName: string;
  clerkPublishableKey: string;
}) {
  return /* replace-me-with-js-to-format */ `import {
  useAuth,
  ClerkProvider,
  SignInButton,
  SignedIn,
  SignedOut,
} from "@clerk/clerk-react";
import { init } from "@instantdb/react";
import { useEffect } from "react";

const db = init({ appId: "${appId}" });

function ClerkSignedInComponent() {
  const { getToken, signOut } = useAuth();

  const signInToInstantWithClerkToken = async () => {
    // getToken gets the jwt from Clerk for your signed in user.
    const idToken = await getToken();

    if (!idToken) {
      // No jwt, can't sign in to instant
      return;
    }

    // Create a long-lived session with Instant for your clerk user
    // It will look up the user by email or create a new user with
    // the email address in the session token.
    db.auth.signInWithIdToken({
      clientName: "${clientName}",
      idToken: idToken,
    });
  };

  useEffect(() => {
    signInToInstantWithClerkToken();
  }, []);

  const { isLoading, user, error } = db.useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>Error signing in to Instant! {error.message}</div>;
  }
  if (user) {
    return (
      <div>
        <p>Signed in with Instant through Clerk!</p>{" "}
        <button
          onClick={() => {
            // First sign out of Instant to clear the Instant session.
            db.auth.signOut().then(() => {
              // Then sign out of Clerk to clear the Clerk session.
              signOut();
            });
          }}
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <div>
      <button onClick={signInToInstantWithClerkToken}>
        Sign in to Instant
      </button>
    </div>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey="${clerkPublishableKey}">
      <SignedOut>
        <SignInButton />
      </SignedOut>
      <SignedIn>
        <ClerkSignedInComponent />
      </SignedIn>
    </ClerkProvider>
  );
}

export default App;`;
}

export function ClerkClient({
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

  const clerkPublishableKey = client.meta?.clerkPublishableKey;

  const domain = clerkPublishableKey
    ? domainFromClerkKey(clerkPublishableKey)
    : null;

  const exampleCode = clerkExampleCode({
    appId: app.id,
    clientName: client.client_name,
    clerkPublishableKey: clerkPublishableKey || 'YOUR_CLERK_PUBLISHABLE_KEY',
  });

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
              <Image alt="clerk logo" src={clerkLogoSvg} />
              <SectionHeading>
                {client.client_name}{' '}
                <span className="text-gray-400">(Clerk)</span>
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
            {clerkPublishableKey ? (
              <Copyable
                label="Clerk publishable key"
                value={clerkPublishableKey}
              />
            ) : null}
            {domain ? <Copyable label="Clerk domain" value={domain} /> : null}

            <SubsectionHeading>Setup and usage</SubsectionHeading>
            <Content>
              <strong>1.</strong> Navigate to your{' '}
              <a
                className="underline"
                href={`https://dashboard.clerk.com`}
                target="_blank"
                rel="noopener noreferer"
              >
                Clerk dashboard
              </a>
              . On the <code>Sessions</code> page, click the <code>Edit</code>{' '}
              button in the <code>Customize session token</code> section. Ensure
              your <code>Claims</code> field has the email claim:
              <div className="border rounded text-sm overflow-auto">
                <Fence
                  copyable
                  code={`{
  "email": "{{user.primary_email_address}}"
}`}
                  language="json"
                />
              </div>
            </Content>
            <Content>
              <strong>2.</strong> Use <code>db.auth.signInWithIdToken</code> to
              link your Clerk user to Instant.
            </Content>

            <div className="border rounded text-sm overflow-auto">
              <Fence copyable code={exampleCode} language="typescript" />
            </div>

            <Divider />

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

export function AddClerkClientForm({
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
  const [clientName, setClientName] = useState<string>(() => findName('clerk', usedClientNames));
  const [publishableKey, setPublishableKey] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [addedEmailClaim, setAddedEmailClaim] = useState(false);

  const validationError = () => {
    if (!clientName) {
      return 'Missing unique name';
    }
    if (usedClientNames.has(clientName)) {
      return `The unique name '${clientName}' is already in use.`;
    }
    if (!publishableKey) {
      return 'Missing Clerk publishable key';
    }

    if (!publishableKey.startsWith('pk_')) {
      return 'Invalid publishable key. It should start with "pk_".';
    }
  };

  const onSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    const err = validationError();
    if (err) {
      errorToast(err, { autoClose: 5000 });
      return;
    }
    const domain = domainFromClerkKey(publishableKey);
    if (!domain) {
      errorToast(
        'Could not determine Clerk domain from key. Ping us in Discord for help.',
        { autoClose: 5000 },
      );
    }
    try {
      setIsLoading(true);
      const resp = await addClient({
        token,
        appId: app.id,
        providerId: provider.id,
        clientName,
        discoveryEndpoint: `https://${domain}/.well-known/openid-configuration`,
        meta: { clerkPublishableKey: publishableKey },
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
      <SubsectionHeading>Add a new Clerk app</SubsectionHeading>
      <TextInput
        tabIndex={1}
        value={clientName}
        onChange={setClientName}
        label="Unique name"
        placeholder="e.g. clerk"
      />
      <TextInput
        tabIndex={2}
        value={publishableKey}
        onChange={setPublishableKey}
        label={
          <>
            Clerk publishable key from your{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferer"
              href="https://dashboard.clerk.com/last-active?path=api-keys"
            >
              Clerk dashboard
            </a>
          </>
        }
        placeholder=""
      />
      <div className="rounded border p-4 flex flex-col gap-2 bg-gray-50">
        <Content>
          Navigate to your{' '}
          <a
            className="underline"
            href={'https://dashboard.clerk.com/last-active?path=sessions'}
            target="_blank"
            rel="noopener noreferer"
          >
            Clerk dashboard
          </a>
          . On the <code>Sessions</code> page, click the <code>Edit</code>{' '}
          button in the <code>Customize session token</code> section. Ensure
          your <code>Claims</code> field has the email claim:
          <div className="border rounded text-sm overflow-auto">
            <Fence
              copyable
              code={`{
  "email": "{{user.primary_email_address}}"
}`}
              language="json"
            />
          </div>
        </Content>
        <Checkbox
          required={true}
          checked={addedEmailClaim}
          onChange={setAddedEmailClaim}
          label='The session token has the "email" claim.'
        />
      </div>
      <Button loading={isLoading} type="submit">
        Add Clerk app
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

export function ClerkClients({
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
          <ClerkClient
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
          <AddClerkClientForm
            app={app}
            provider={provider}
            onAddClient={handleAddClient}
            onCancel={() => setShowAddClientForm(false)}
            usedClientNames={usedClientNames}
          />
        </>
      ) : (
        <Button onClick={() => setShowAddClientForm(true)} variant="secondary">
          <PlusIcon height={14} /> Add {clients.length > 0 ? 'another ' : ''}Clerk app
        </Button>
      )}
      
    </div>
  );
}
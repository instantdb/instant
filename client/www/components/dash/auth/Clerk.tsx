import { FormEventHandler, useContext, useState } from 'react';
import { clerkDomainFromPublishableKey } from '@instantdb/platform';
import { errorToast } from '@/lib/toast';
import { TokenContext } from '@/lib/contexts';
import {
  Button,
  Checkbox,
  Content,
  Copyable,
  Fence,
  SubsectionHeading,
  TextInput,
} from '@/components/ui';
import clerkLogoSvg from '../../../public/img/clerk_logo_black.svg';
import Image from 'next/image';
import { messageFromInstantError } from '@/lib/errors';
import { addProvider, addClient, findName, updateClientMeta } from './shared';
import {
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';
import { useDarkMode } from '../DarkModeToggle';

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
        messageFromInstantError(e as InstantIssue) ||
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
          <Image className="dark:invert" alt="clerk logo" src={clerkLogoSvg} />
          <span>Setup Clerk</span>
        </span>
      </Button>
    </div>
  );
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
  onUpdateClient,
}: {
  app: InstantApp;
  client: OAuthClient;
  onUpdateClient: (client: OAuthClient) => void;
}) {
  const token = useContext(TokenContext);
  const [isLoading, setIsLoading] = useState(false);
  const [showUpdateVerified] = useState(client.meta.allowUnverifiedEmail);

  const { darkMode } = useDarkMode();

  const clerkPublishableKey = client.meta?.clerkPublishableKey;

  const allowUnverifiedEmail = client.meta?.allowUnverifiedEmail;

  const domain = clerkPublishableKey
    ? clerkDomainFromPublishableKey(clerkPublishableKey)
    : null;

  const exampleCode = clerkExampleCode({
    appId: app.id,
    clientName: client.client_name,
    clerkPublishableKey: clerkPublishableKey || 'YOUR_CLERK_PUBLISHABLE_KEY',
  });

  const updateAllowUnverified = async (allowUnverifiedEmail: boolean) => {
    try {
      setIsLoading(true);
      const resp = await updateClientMeta({
        token,
        appId: app.id,
        clientDatabaseId: client.id,
        meta: { allowUnverifiedEmail: allowUnverifiedEmail },
      });
      onUpdateClient(resp.client);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) || 'Error updating client.';
      errorToast(msg, { autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Copyable label="Client name" value={client.client_name} />
      {clerkPublishableKey ? (
        <Copyable label="Clerk publishable key" value={clerkPublishableKey} />
      ) : null}
      {domain ? <Copyable label="Clerk domain" value={domain} /> : null}

      {showUpdateVerified ? (
        <div className="flex flex-col gap-2 rounded-sm border bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
          <Checkbox
            checked={allowUnverifiedEmail}
            onChange={() =>
              updateAllowUnverified(!client.meta.allowUnverifiedEmail)
            }
            label="Allow unverified emails"
          />
          <Content>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {allowUnverifiedEmail ? (
                <>
                  When checked, we will store the email for users even if their
                  email is not verified.
                </>
              ) : (
                <>
                  When unchecked, we will only store the email for users with
                  verified emails. Make sure your JWT includes the{' '}
                  <code>email_verified</code> claim. If the claim is missing or
                  the email is not verified, we won't set the email for that
                  user when they sign in with Instant.
                </>
              )}
            </p>
          </Content>
        </div>
      ) : null}

      <SubsectionHeading>Setup and usage</SubsectionHeading>
      <Content>
        <strong>1.</strong> Navigate to your{' '}
        <a
          className="underline dark:text-white"
          href={`https://dashboard.clerk.com`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Clerk dashboard
        </a>
        . On the <code className="dark:text-white">Sessions</code> page, click
        the <code className="dark:text-white">Edit</code> button in the{' '}
        <code className="dark:text-white">Customize session token</code>{' '}
        section. Ensure your <code className="dark:text-white">Claims</code>{' '}
        field has the email claim:
        <div className="overflow-auto rounded-sm border text-sm dark:border-none">
          <Fence
            darkMode={darkMode}
            copyable
            code={`{
  "email": "{{user.primary_email_address}}",
  "email_verified": "{{user.email_verified}}"
}`}
            language="json"
          />
        </div>
      </Content>
      <Content className="dark:text-white">
        <strong>2.</strong> Use{' '}
        <code className="dark:text-white">db.auth.signInWithIdToken</code> to
        link your Clerk user to Instant.
      </Content>

      <div className="overflow-auto rounded-sm border text-sm dark:border-none">
        <Fence
          darkMode={darkMode}
          copyable
          code={exampleCode}
          language="typescript"
        />
      </div>
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
  const [clientName, setClientName] = useState<string>(() =>
    findName('clerk', usedClientNames),
  );
  const [publishableKey, setPublishableKey] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [addedEmailClaim, setAddedEmailClaim] = useState(false);

  const { darkMode } = useDarkMode();

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
    const domain = clerkDomainFromPublishableKey(publishableKey);
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
              rel="noopener noreferrer"
              href="https://dashboard.clerk.com/last-active?path=api-keys"
            >
              Clerk dashboard
            </a>
          </>
        }
        placeholder=""
      />
      <div className="flex flex-col gap-2 rounded-sm border bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <Content>
          Navigate to your{' '}
          <a
            className="underline dark:text-white"
            href={'https://dashboard.clerk.com/last-active?path=sessions'}
            target="_blank"
            rel="noopener noreferrer"
          >
            Clerk dashboard
          </a>
          . On the <code className="dark:text-white">Sessions</code> page, click
          the <code className="dark:text-white">Edit</code> button in the{' '}
          <code className="dark:text-white">Customize session token</code>{' '}
          section. Ensure your <code className="dark:text-white">Claims</code>{' '}
          field has the email claim:
          <div className="overflow-auto rounded-sm border text-sm dark:border-none">
            <Fence
              darkMode={darkMode}
              copyable
              code={`{
  "email": "{{user.primary_email_address}}",
  "email_verified": "{{user.email_verified}}"
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

import { FormEventHandler, useContext, useState } from 'react';
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
import { messageFromInstantError } from '@/lib/errors';
import { addClient, findName } from './shared';
import {
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';
import { useDarkMode } from '../DarkModeToggle';

function firebaseExampleCode({
  appId,
  clientName,
}: {
  appId: string;
  clientName: string;
}) {
  return /* ts */ `import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { init } from '@instantdb/react';

const db = init({ appId: "${appId}" });

function App() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        user.getIdToken().then((idToken) => {
          db.auth.signInWithIdToken({ idToken, clientName: "${clientName}" });
        });
      } else {
        db.auth.signOut();
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <div>
      <db.SignedIn>
        <div>Logged in to Firebase Auth and Instant!</div>
      </db.SignedIn>
      <db.SignedOut>
        <div>Log in with Firebase Auth.</div>
      </db.SignedOut>
    </div>
  );
}`;
}

export function FirebaseClient({
  app,
  client,
}: {
  app: InstantApp;
  client: OAuthClient;
}) {
  const { darkMode } = useDarkMode();

  const projectId = client.discovery_endpoint?.match(
    /^https:\/\/securetoken\.google\.com\/(.+)\/\.well-known\/openid-configuration$/,
  )?.[1];

  const exampleCode = firebaseExampleCode({
    appId: app.id,
    clientName: client.client_name,
  });

  return (
    <div className="flex flex-col gap-4">
      <Copyable label="Client name" value={client.client_name} />
      {projectId ? (
        <Copyable label="Firebase Project ID" value={projectId} />
      ) : null}

      <SubsectionHeading>Setup and usage</SubsectionHeading>

      <Content>
        Use <code className="dark:text-white">db.auth.signInWithIdToken</code>{' '}
        to link your Firebase user to Instant.
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

export function AddFirebaseClientForm({
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
    findName('firebase', usedClientNames),
  );
  const [projectId, setProjectId] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);

  const validationError = () => {
    if (!clientName) {
      return 'Missing unique name';
    }
    if (usedClientNames.has(clientName)) {
      return `The unique name '${clientName}' is already in use.`;
    }
    if (!projectId) {
      return 'Missing Firebase project ID';
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
        discoveryEndpoint: `https://securetoken.google.com/${projectId}/.well-known/openid-configuration`,
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
        placeholder="e.g. firebase"
      />
      <TextInput
        tabIndex={2}
        value={projectId}
        onChange={setProjectId}
        label={
          <>
            Firebase <code>Project ID</code> from your Project Settings page on
            the{' '}
            <a
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
              href="https://console.firebase.google.com/"
            >
              Firebase dashboard
            </a>
            .
          </>
        }
        placeholder=""
      />
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

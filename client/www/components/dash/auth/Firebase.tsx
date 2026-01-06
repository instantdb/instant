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
} from '@heroicons/react/24/solid';
import firebaseLogoSvg from '../../../public/img/firebase_auth.svg';
import Image from 'next/image';
import { messageFromInstantError } from '@/lib/errors';
import { addProvider, addClient, deleteClient, findName } from './shared';
import {
  InstantApp,
  InstantIssue,
  OAuthClient,
  OAuthServiceProvider,
} from '@/lib/types';
import { useDarkMode } from '../DarkModeToggle';

export function AddFirebaseProviderForm({
  app,
  onAddProvider,
}: {
  app: InstantApp;
  onAddProvider: (provider: OAuthServiceProvider) => void;
}) {
  const token = useContext(TokenContext);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const addFirebaseProvider = async () => {
    setIsLoading(true);
    try {
      const resp = await addProvider({
        token,
        appId: app.id,
        providerName: 'firebase',
      });
      onAddProvider(resp.provider);
    } catch (e) {
      console.error(e);
      const msg =
        messageFromInstantError(e as InstantIssue) ||
        'There was an error setting up Firebase.';
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
        onClick={addFirebaseProvider}
      >
        <span className="flex items-center space-x-2">
          <Image alt="firebase logo" src={firebaseLogoSvg} />
          <span>Setup Firebase</span>
        </span>
      </Button>
    </div>
  );
}

function firebaseExampleCode({
  appId,
  clientName,
}: {
  appId: string;
  clientName: string;
}) {
  return /* ts */ `
import { useEffect } from 'react';
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
  const projectId = client.discovery_endpoint?.match(
    /^https:\/\/securetoken\.google\.com\/(.+)\/\.well-known\/openid-configuration$/,
  )?.[1];

  const exampleCode = firebaseExampleCode({
    appId: app.id,
    clientName: client.client_name,
  });

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
              <Image alt="firebase logo" src={firebaseLogoSvg} />
              <div className="font-medium">
                {client.client_name}{' '}
                <span className="text-gray-400 dark:text-neutral-500">
                  (Firebase)
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
            <Copyable label="Client name" value={client.client_name} />
            {projectId ? (
              <Copyable label="Firebase Project ID" value={projectId} />
            ) : null}

            <SubsectionHeading>Setup and usage</SubsectionHeading>

            <Content>
              Use{' '}
              <code className="dark:text-white">db.auth.signInWithIdToken</code>{' '}
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
      className="flex flex-col gap-2 rounded-sm border p-4 dark:border-neutral-700"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <SubsectionHeading>Add a new Firebase app</SubsectionHeading>
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
              rel="noopener noreferer"
              href="https://console.firebase.google.com/"
            >
              Firebase dashboard
            </a>
            .
          </>
        }
        placeholder=""
      />
      <Button loading={isLoading} type="submit">
        Add Firebase app
      </Button>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

export function FirebaseClients({
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
          <FirebaseClient
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
          <AddFirebaseClientForm
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
          Firebase app
        </Button>
      )}
    </div>
  );
}

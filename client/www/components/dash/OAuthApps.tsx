import {
  SectionHeading,
  Button,
  SubsectionHeading,
  TextInput,
  Divider,
  Dialog,
  Copyable,
  Label,
  Content,
  redactedValue,
} from '@/components/ui';
import { useAuthedFetch, useAuthToken } from '@/lib/auth';
import { messageFromInstantError } from '@/lib/errors';
import config, { discordOAuthAppsFeedbackInviteUrl } from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import {
  InstantIssue,
  OAuthApp,
  OAuthAppClient,
  OAuthAppClientSecret,
  OAuthAppsResponse,
} from '@/lib/types';

import {
  createContext,
  FormEventHandler,
  Fragment,
  PropsWithChildren,
  useContext,
  useState,
} from 'react';
import { Loading, ErrorMessage } from '@/components/dash/shared';
import { errorToast, successToast } from '@/lib/toast';

import {
  ArrowUpTrayIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { useReadyRouter } from '../clientOnlyPage';
import { encode } from 'querystring';
import Link from 'next/link';
import clsx from 'clsx';
import format from 'date-fns/format';

// API Functions
// -------------

export async function createOAuthApp({
  token,
  appId,
  appName,
  homepageUrl,
  logoDataUrl,
  appPrivacyPolicyLink,
  appTosLink,
  supportEmail,
}: {
  token: string;
  appId: string;
  appName: string;
  homepageUrl?: string | null | undefined;
  logoDataUrl?: string | null | undefined;
  appPrivacyPolicyLink?: string | null | undefined;
  appTosLink?: string | null | undefined;
  supportEmail?: string | null | undefined;
}) {
  const resp = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth-apps`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        app_name: appName,
        // Server doesn't handle empty strings well
        app_home_page: homepageUrl ? homepageUrl : null,
        app_logo: logoDataUrl ? logoDataUrl : null,
        app_privacy_policy_link: appPrivacyPolicyLink
          ? appPrivacyPolicyLink
          : null,
        app_tos_link: appTosLink ? appTosLink : null,
        support_email: supportEmail ? supportEmail : null,
      }),
    },
  );
  return resp;
}

async function updateApp({
  appId,
  oauthAppId,
  token,
  appName,
  appHomePage,
  appLogo,
  appPrivacyPolicyLink,
  appTosLink,
  supportEmail,
}: {
  appId: string;
  oauthAppId: string;
  token: string;
  appName?: string | null;
  appHomePage?: string | null;
  appLogo?: string | null;
  appPrivacyPolicyLink?: string | null;
  appTosLink?: string | null;
  supportEmail?: string | null;
}) {
  const resp = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth-apps/${oauthAppId}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        app_name: appName,
        app_home_page: appHomePage,
        app_logo: appLogo,
        app_privacy_policy_link: appPrivacyPolicyLink,
        app_tos_link: appTosLink,
        support_email: supportEmail,
      }),
    },
  );
  return resp;
}

export async function deleteOAuthApp({
  appId,
  oauthAppId,
  token,
}: {
  appId: string;
  oauthAppId: string;
  token: string;
}) {
  const resp = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth-apps/${oauthAppId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
  return resp;
}

export async function createClient({
  token,
  appId,
  oauthAppId,
  clientName,
  authorizedRedirectUrls,
}: {
  token: string;
  appId: string;
  oauthAppId: string;
  clientName: string;
  authorizedRedirectUrls: string[];
}) {
  const resp = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth-apps/${oauthAppId}/clients`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        client_name: clientName,
        authorized_redirect_urls: authorizedRedirectUrls,
      }),
    },
  );
  return resp;
}

async function updateClient({
  token,
  appId,
  clientId,
  clientName,
  addRedirectUrl,
  removeRedirectUrl,
}: {
  token: string;
  appId: string;
  clientId: string;
  clientName?: string | null | undefined;
  addRedirectUrl?: string | null | undefined;
  removeRedirectUrl?: string | null | undefined;
}) {
  const resp = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth-app-clients/${clientId}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        client_name: clientName,
        add_redirect_url: addRedirectUrl,
        remove_redirect_url: removeRedirectUrl,
      }),
    },
  );
  return resp;
}

async function deleteClient({
  token,
  appId,
  clientId,
}: {
  token: string;
  appId: string;
  clientId: string;
}) {
  const resp = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth-app-clients/${clientId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
  return resp;
}

async function deleteClientSecret({
  token,
  appId,
  clientSecretId,
}: {
  token: string;
  appId: string;
  clientSecretId: string;
}) {
  const resp = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth-app-client-secrets/${clientSecretId}`,
    {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
  return resp;
}

async function createClientSecret({
  token,
  appId,
  clientId,
}: {
  token: string;
  appId: string;
  clientId: string;
}) {
  const resp = await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/oauth-app-clients/${clientId}/client-secrets`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );
  return resp;
}

// Components
// ----------

interface OAuthAppContext {
  appId: string;
  onCreateApp: (oauthApp: OAuthApp) => void;
  onUpdateApp: (app: OAuthApp) => void;
  onDeleteApp: (app: OAuthApp) => void;

  onCreateClient: (resp: {
    client: OAuthAppClient;
    clientSecret: OAuthAppClientSecret;
    secretValue: string;
  }) => void;
  onUpdateClient: (client: OAuthAppClient) => void;
  onDeleteClient: (client: OAuthAppClient) => void;

  onCreateClientSecret: (params: {
    clientSecret: OAuthAppClientSecret;
    secretValue: string;
  }) => void;
  onDeleteClientSecret: (clientSecret: OAuthAppClientSecret) => void;
}

const OAuthAppContext = createContext<OAuthAppContext | null>(null);

function exceptionToast(e: unknown, backupMsg: string) {
  const msg = messageFromInstantError(e as InstantIssue) || backupMsg;
  errorToast(msg, { autoClose: 60000 });
}

function DeleteClientSecret({
  clientSecret,
}: {
  clientSecret: OAuthAppClientSecret;
}) {
  const token = useAuthToken()!;

  const { appId, onDeleteClientSecret } = useContext(OAuthAppContext)!;

  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    try {
      setLoading(true);
      const resp = await deleteClientSecret({
        token: token,
        appId: appId,
        clientSecretId: clientSecret.id,
      });

      if (!resp.clientSecret) {
        errorToast('Error deleting client secret.');
        return;
      }
      onDeleteClientSecret(resp.clientSecret);
      setShowConfirm(false);
    } catch (e) {
      console.error(e);
      exceptionToast(e, 'There was an error deleting the client secret.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={showConfirm} onClose={() => setShowConfirm(false)}>
        <SubsectionHeading>Delete client secret</SubsectionHeading>
        <div className="flex flex-col gap-4 p-4">
          <label className="flex flex-col gap-2">
            <Label>Secret</Label>
            <pre className="text-sm">
              {clientSecret.firstFour}
              {redactedValue(' '.repeat(32))}
            </pre>
          </label>
          <Content>
            This secret will stop working immediately after clicking "Delete".
            Be sure that you've removed any reference to this secret in your
            code before deleting.
          </Content>
          <div className="flex flex-row gap-2 w-full">
            <Button
              loading={loading}
              variant="destructive"
              onClick={handleDelete}
            >
              Delete secret
            </Button>

            <Button variant="secondary" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
      <Button
        className="hidden group-hover:block"
        variant="destructive"
        size="mini"
        onClick={() => setShowConfirm(true)}
      >
        <TrashIcon height="1em" />
      </Button>
    </>
  );
}

function ClientRedirectUrl({
  clientId,
  redirectUrl,
}: {
  clientId: string;
  redirectUrl: string;
}) {
  const token = useAuthToken()!;
  const { appId, onUpdateClient } = useContext(OAuthAppContext)!;
  const [loading, setLoading] = useState(false);
  const removeRedirectUrl = async () => {
    try {
      const resp = await updateClient({
        token,
        appId,
        clientId,
        removeRedirectUrl: redirectUrl,
      });
      if (!resp.client) {
        errorToast('Error updating OAuth client.');
        return;
      }
      onUpdateClient(resp.client);
    } catch (e) {
      console.error(e);
      exceptionToast(e, 'Error updating OAuth client.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="group/redirect flex flex-row gap-4">
      <Copyable value={redirectUrl} />
      <Button
        className="invisible group-hover/redirect:visible"
        size="mini"
        variant="destructive"
        onClick={removeRedirectUrl}
        loading={loading}
      >
        <TrashIcon height={'1em'} />
      </Button>
    </div>
  );
}

function Client({ client }: { client: OAuthAppClient }) {
  const token = useAuthToken()!;
  const { appId, onCreateClientSecret, onUpdateClient, onDeleteClient } =
    useContext(OAuthAppContext)!;
  const [showDeleteClientDialog, setShowDeleteClientDialog] = useState(false);
  const [loadingClientSecret, setLoadingClientSecret] = useState(false);
  const [loadingAddRedirectUrl, setLoadingAddRedirectUrl] = useState(false);
  const [showAddRedirectUrl, setShowAddRedirectUrl] = useState(false);
  const [addRedirectUrl, setAddRedirectUrl] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleCreateClientSecret = async () => {
    try {
      setLoadingClientSecret(true);
      const resp = await createClientSecret({
        appId,
        token,
        clientId: client.clientId,
      });

      if (!resp.clientSecret || !resp.secretValue) {
        errorToast('Error creating client secret');
        return;
      }
      onCreateClientSecret({
        clientSecret: resp.clientSecret,
        secretValue: resp.secretValue,
      });
    } catch (e) {
      console.error(e);
      exceptionToast(e, 'Error creating client secret');
    } finally {
      setLoadingClientSecret(false);
    }
  };

  const handleAddRedirectUrl = async ({
    redirectUrl,
  }: {
    redirectUrl: string;
  }) => {
    try {
      setLoadingAddRedirectUrl(true);
      const resp = await updateClient({
        appId,
        token,
        clientId: client.clientId,
        addRedirectUrl: redirectUrl,
      });

      if (!resp.client) {
        errorToast('Error adding redirect url');
        return;
      }
      onUpdateClient(client);
      setShowAddRedirectUrl(false);
      setAddRedirectUrl('');
    } catch (e) {
      console.error(e);
      exceptionToast(e, 'Error adding redirect url');
    } finally {
      setLoadingAddRedirectUrl(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const resp = await deleteClient({
        token: token,
        appId,
        clientId: client.clientId,
      });
      if (!resp.client) {
        errorToast('Error deleting OAuth client');
        return;
      }
      onDeleteClient(resp.client);
      setDeleting(false);
      successToast('OAuth client deleted');
    } catch (e) {
      console.error(e);
      exceptionToast(e, 'Error deleting OAuth client');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 relative group/delete-parent">
      <Button
        className="absolute top-0 right-0 hidden group-hover/delete-parent:block"
        variant="destructive"
        size="mini"
        onClick={() => setShowDeleteClientDialog(true)}
      >
        <TrashIcon height={'1.2em'} />
      </Button>
      <Dialog
        open={showDeleteClientDialog}
        onClose={() => setShowDeleteClientDialog(false)}
      >
        <SubsectionHeading>Delete {client.clientName}</SubsectionHeading>
        <div className="flex flex-col gap-4 p-4">
          <Content>
            Deleting this OAuth client will delete all tokens associated with
            the client. It can't be undone.
          </Content>
          <div className="flex flex-row gap-2">
            <Button
              variant="destructive"
              loading={deleting}
              onClick={handleDelete}
            >
              Delete <code>`{client.clientName}`</code>
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowDeleteClientDialog(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>

      <label className="flex flex-col gap-2">
        <Label>Name</Label>
        <div>{client.clientName}</div>
      </label>
      <label className="flex flex-col gap-2">
        <Label>Client ID</Label>
        <Copyable value={client.clientId} />
      </label>
      <label className="flex flex-col gap-2">
        <Label>Client Secrets</Label>
        <div>
          {client.clientSecrets?.length ? (
            <table className="mx-2 my-2 flex-1 text-left text-xs">
              <thead className="text-xs text-gray-500">
                <th className="pr-2 text-xs text-gray-500">Secret</th>
                <th className="pr-2">Create Date</th>
                <th className="pr-2"></th>
              </thead>
              <tbody>
                {client.clientSecrets?.map((clientSecret) => (
                  <tr key={clientSecret.id} className="group">
                    <td className="pr-2">
                      <pre className="text-sm">
                        {clientSecret.firstFour}
                        {redactedValue(' '.repeat(16))}
                      </pre>
                    </td>
                    <td className="pr-2">
                      {format(new Date(clientSecret.createdAt), 'MMM dd, yyyy')}
                    </td>
                    <td className="pr-2 mr-2 w-12">
                      <div className="hidden group-hover:block">
                        <DeleteClientSecret clientSecret={clientSecret} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <Button
            variant="secondary"
            size="mini"
            onClick={handleCreateClientSecret}
            loading={loadingClientSecret}
          >
            <PlusIcon height={'1em'} /> Create client secret
          </Button>
        </div>
      </label>
      <label className="flex flex-col gap-2">
        <Label>Authorized Redirect URLs</Label>
        {client.authorizedRedirectUrls?.map((redirectUrl) => (
          <ClientRedirectUrl
            key={redirectUrl}
            redirectUrl={redirectUrl}
            clientId={client.clientId}
          />
        ))}

        {showAddRedirectUrl ? (
          <TextInput
            type="text"
            autoFocus={true}
            value={addRedirectUrl}
            onChange={setAddRedirectUrl}
            onBlur={() => setShowAddRedirectUrl(false)}
            disabled={loadingAddRedirectUrl}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddRedirectUrl({ redirectUrl: addRedirectUrl });
              }
            }}
            placeholder="Redirect url, hit Enter to submit"
          />
        ) : (
          <div>
            <Button
              variant="secondary"
              size="mini"
              onClick={(e) => {
                e.preventDefault();
                setShowAddRedirectUrl(true);
              }}
              loading={loadingAddRedirectUrl}
            >
              <PlusIcon height={'1em'} /> Add redirect URL
            </Button>
          </div>
        )}
      </label>
    </div>
  );
}

function Clients({ clients }: { clients: OAuthAppClient[] }) {
  return (
    <div className="flex flex-col gap-4">
      {clients.map((c, i) => (
        <Fragment key={c.clientId}>
          <Client key={c.clientId} client={c} />
          {i !== clients.length - 1 ? <Divider /> : null}
        </Fragment>
      ))}
    </div>
  );
}

function AuthorizedRedirectUrlsInput({
  urls,
  onAdd,
  onRemove,
}: {
  urls: string[];
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const [url, setUrl] = useState('');
  const handleAddUrl = (e: any) => {
    e.preventDefault();
    if (url) {
      setUrl('');
      onAdd(url);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <Label>Authorized Redirect URLs</Label>
        {urls.map((u) => (
          <div key={u} className="flex flex-row gap-2">
            <div>{u}</div>
            <Button
              onClick={(e) => {
                e.preventDefault();
                onRemove(u);
              }}
              variant="destructive"
              size="mini"
            >
              <TrashIcon height={'1em'} />
            </Button>
          </div>
        ))}
      </label>
      <div className="flex flex-row gap-2">
        <div className="flex-1 min-w-0">
          <TextInput
            value={url}
            onChange={setUrl}
            placeholder="Add redirect url"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddUrl(e);
              }
            }}
          />
        </div>
        <Button variant="subtle" size="mini" onClick={handleAddUrl}>
          <PlusIcon height={'1em'} />
        </Button>
      </div>
    </div>
  );
}

function CreateClientForm({
  oauthAppId,
  onClose,
}: {
  oauthAppId: string;
  onClose: () => void;
}) {
  const token = useAuthToken()!;
  const { appId, onCreateClient } = useContext(OAuthAppContext)!;
  const [clientName, setClientName] = useState('');

  const [authorizedRedirectUrls, setAuthorizedRedirectUrls] = useState<
    string[]
  >([]);

  const [isLoading, setIsLoading] = useState(false);

  const onAddUrl = (s: string) => {
    setAuthorizedRedirectUrls([...authorizedRedirectUrls, s]);
  };

  const onRemoveUrl = (s: string) => {
    setAuthorizedRedirectUrls(authorizedRedirectUrls.filter((x) => x !== s));
  };

  const validationError = () => {
    if (!clientName.trim()) {
      return 'Unique name is missing.';
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
      const resp = await createClient({
        appId,
        oauthAppId,
        token,
        clientName,
        authorizedRedirectUrls,
      });

      if (!resp.client) {
        throw new Error('Missing client in response.');
      }
      onCreateClient(resp);
      onClose();
    } catch (e) {
      console.error(e);
      exceptionToast(e, 'There was an error creating the OAuth client');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 p-4 rounted border"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <SubsectionHeading>Create a new Client</SubsectionHeading>
      <TextInput
        value={clientName}
        onChange={setClientName}
        label="Unique name"
        placeholder="Unique name"
        required={true}
      />
      <AuthorizedRedirectUrlsInput
        urls={authorizedRedirectUrls}
        onAdd={onAddUrl}
        onRemove={onRemoveUrl}
      />
      <Button loading={isLoading} type="submit">
        Add OAuth Client
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </form>
  );
}

function CreateClient({
  oauthAppId,
  defaultOpen,
}: {
  oauthAppId: string;
  defaultOpen: boolean;
}) {
  const [showForm, setShowForm] = useState(defaultOpen);

  if (!showForm) {
    return (
      <Button variant="secondary" onClick={() => setShowForm(true)}>
        <PlusIcon height={'1em'} /> Create Client
      </Button>
    );
  }

  return (
    <CreateClientForm
      oauthAppId={oauthAppId}
      onClose={() => setShowForm(false)}
    />
  );
}

export function AppLogo({
  app,
}: {
  app: { appLogo: string | null; appName: string };
}) {
  return app.appLogo ? (
    <img className="w-12 h-12" src={app.appLogo} />
  ) : (
    <div className="flex items-center justify-center w-12 h-12 bg-gray-200">
      <span className="text-2xl font-semibold text-gray-700">
        {app.appName.substring(0, 1).toUpperCase()}
      </span>
    </div>
  );
}

type EditableAppField =
  | 'appLogo'
  | 'appName'
  | 'appHomePage'
  | 'appPrivacyPolicyLink'
  | 'appTosLink'
  | 'supportEmail';

function labelOfEditableAppField(field: EditableAppField) {
  switch (field) {
    case 'appLogo':
      return 'App Logo';
    case 'appName':
      return 'App Name';
    case 'appHomePage':
      return 'Homepage URL';
    case 'appPrivacyPolicyLink':
      return 'Privacy Policy URL';
    case 'appTosLink':
      return 'Terms of Service URL';
    case 'supportEmail':
      return 'Support Email';
  }
}

function EditableAppInput({
  app,
  field,
  onSave,
}: {
  app: OAuthApp;
  field: EditableAppField;
  onSave: (field: EditableAppField, value: any) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string | null>(app[field]);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setEditing(false);
    setValue(app[field]);
  };
  return (
    <label className="flex flex-col gap-2">
      <Label>{labelOfEditableAppField(field)}</Label>
      {editing ? (
        <TextInput
          className="p-0 border-0 border-b border-gray-300 max-w-sm outline-none focus:shadow-none focus:ring-0 focus:outline-none rounded-none"
          value={value || ''}
          onChange={setValue}
          autoFocus={true}
          onBlur={reset}
          disabled={loading}
          onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              setLoading(true);
              try {
                await onSave(field, value);
              } finally {
                setEditing(false);
                setLoading(false);
              }
            }
          }}
        />
      ) : (
        <div className="cursor-pointer" onClick={() => setEditing(true)}>
          {app[field] || <span className="italic">Not set</span>}
        </div>
      )}
    </label>
  );
}

function App({ app }: { app: OAuthApp }) {
  const token = useAuthToken()!;

  const [showDeleteAppDialog, setShowDeleteAppDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { appId, onUpdateApp, onDeleteApp } = useContext(OAuthAppContext)!;

  const updateField = async (field: EditableAppField, value: any) => {
    try {
      const resp = await updateApp({
        appId: app.appId,
        oauthAppId: app.id,
        token: token,
        [field]: value,
      });

      if (!resp.app) {
        throw new Error('Unexpected result from API.');
      }
      onUpdateApp(resp.app);
      successToast(`Updated ${labelOfEditableAppField(field)}`);
    } catch (e) {
      console.error(e);
      exceptionToast(e, `Error uploading ${labelOfEditableAppField(field)}.`);
    }
  };

  const onDataUrl = async (logoDataUrl: string | null) => {
    if (logoDataUrl) {
      updateField('appLogo', logoDataUrl);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const resp = await deleteOAuthApp({
        token: token,
        appId,
        oauthAppId: app.id,
      });
      if (!resp.app) {
        errorToast('Error deleting OAuth app');
        return;
      }
      onDeleteApp(resp.app);
      setDeleting(false);
      successToast('OAuth app deleted');
    } catch (e) {
      console.error(e);
      exceptionToast(e, 'Error deleting OAuth app');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {app.isPublic ? null : (
        <div className="max-w-md flex bg-sky-50 dark:bg-slate-800/60 dark:ring-1 dark:ring-slate-300/10">
          <Content className="m-4 text-sm text-sky-800 [--tw-prose-background:theme(colors.sky.50)] prose-a:text-sky-900 prose-code:text-sky-900 dark:text-slate-300 dark:prose-code:text-slate-300">
            This app is in test mode. Only members of this Instant app will be
            allowed to auth with it. Once you've built your integration, ping us
            in{' '}
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={discordOAuthAppsFeedbackInviteUrl}
            >
              #oauth-apps-feedback on Discord
            </a>{' '}
            to release your app to the public.
          </Content>
        </div>
      )}
      <div className="flex flex-col gap-4 max-w-md relative">
        <div className="flex flex-col gap-4 group/delete-parent">
          <Button
            className="absolute top-0 right-0 hidden group-hover/delete-parent:block"
            variant="destructive"
            size="mini"
            onClick={() => setShowDeleteAppDialog(true)}
          >
            <TrashIcon height={'1.2em'} />
          </Button>
          <Dialog
            open={showDeleteAppDialog}
            onClose={() => setShowDeleteAppDialog(false)}
          >
            <SubsectionHeading>Delete {app.appName}</SubsectionHeading>
            <div className="flex flex-col gap-4 p-4">
              <Content>
                Deleting this OAuth app will delete all clients and all tokens
                associated with the app. It can't be undone.
              </Content>
              <div className="flex flex-row gap-2">
                <Button
                  variant="destructive"
                  loading={deleting}
                  onClick={handleDelete}
                >
                  Delete <code>`{app.appName}`</code>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowDeleteAppDialog(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Dialog>
          <label className="flex flex-col gap-2">
            {' '}
            <Label>Logo</Label>
            {app.appLogo ? (
              <div className="relative group w-12 h-12">
                <AppLogo app={app} />
                <div className="absolute top-0 group-hover:block hidden bg-white/75">
                  <UploadLogoInput onDataUrl={onDataUrl} simple={true} />
                </div>
              </div>
            ) : (
              <UploadLogoInput onDataUrl={onDataUrl} />
            )}
          </label>
          {[
            'appName',
            'appHomePage',
            'appPrivacyPolicyLink',
            'appTosLink',
            'supportEmail',
          ].map((field) => (
            <EditableAppInput
              key={field}
              app={app}
              field={field as EditableAppField}
              onSave={updateField}
            />
          ))}
        </div>

        <Divider>
          <Label className="p-2">Clients</Label>
        </Divider>

        {app.clients ? <Clients clients={app.clients} /> : null}

        {app.clients?.length ? <Divider /> : null}

        <CreateClient
          oauthAppId={app.id}
          defaultOpen={(app.clients?.length || 0) === 0}
        />
      </div>
    </>
  );
}

function AppSummaryRow({ app }: { app: OAuthApp }) {
  const router = useReadyRouter();
  const params = new URLSearchParams(encode(router.query));
  params.set('oauthapp', app.id);
  const href = `${router.pathname}?${params.toString()}`;
  return (
    <Link
      href={href}
      className="flex flex-row gap-4 items-center w-full cursor-pointer hover:bg-gray-100 transition-colors duration-200 p-2"
    >
      <AppLogo app={app} />
      <SectionHeading>{app.appName}</SectionHeading>
    </Link>
  );
}

function Apps({ apps }: { apps: OAuthApp[] }) {
  if (!apps.length) {
    return;
  }

  return (
    <div className="flex flex-col gap-6 max-w-md">
      {apps.map((a) => (
        <div key={a.id} className="flex flex-col gap-4">
          <AppSummaryRow app={a} />
          <Divider />
        </div>
      ))}
    </div>
  );
}

function UploadLogoInput({
  onDataUrl,
  simple,
}: {
  onDataUrl: (dataUrl: string | null) => void;
  simple?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex place-content-center w-12 h-12 items-center text-center cursor-pointer',
        {
          'bg-gray-100 border-dashed border-2 border-gray-400 rounded-lg':
            !simple,
        },
      )}
    >
      <input
        id="upload"
        type="file"
        className="hidden"
        accept="image/*"
        multiple={false}
        onChange={(e: React.ChangeEvent<any>) => {
          const file = e.target.files[0];
          if (!file) {
            onDataUrl(null);
            return;
          }

          if (file.size > 1024 * 1024) {
            errorToast('Image should be less than 1mb.');
            return;
          }

          if (
            ![
              'image/jpeg',
              'image/jpg',
              'image/png',
              'image/svg',
              'image/webp',
            ].includes(file.type)
          ) {
            errorToast('Image type should be either png, svg, webp, or jpeg');
            return;
          }

          const reader = new FileReader();
          reader.onload = (e) => {
            onDataUrl(e.target?.result as string);
          };
          reader.onerror = (e) => {
            console.error(e);
            exceptionToast(e, 'There was an error loading the image.');
          };
          reader.readAsDataURL(file);
        }}
      />
      <label htmlFor="upload" className="cursor-pointer">
        <ArrowUpTrayIcon height={'1em'} className="m-auto" />
      </label>
    </div>
  );
}

function CreateAppForm({ onClose }: { onClose: () => void }) {
  const token = useAuthToken()!;
  const { appId, onCreateApp } = useContext(OAuthAppContext)!;
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [appPrivacyPolicyLink, setAppPrivacyPolicyLink] = useState('');
  const [appTosLink, setAppTosLink] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validationError = () => {
    if (!appName.trim()) {
      return 'Unique name is missing.';
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
      const resp = await createOAuthApp({
        appId,
        token,
        appName,
        homepageUrl,
        logoDataUrl,
        appPrivacyPolicyLink,
        appTosLink,
        supportEmail,
      });

      if (!resp.app) {
        throw new Error('Missing app in response.');
      }
      onCreateApp(resp.app);
      onClose();
    } catch (e) {
      console.error(e);
      exceptionToast(e, 'There was an error creating the OAuth app');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2 p-4 rounted border"
      onSubmit={onSubmit}
      autoComplete="off"
      data-lpignore="true"
    >
      <SubsectionHeading>Create a new OAuth App</SubsectionHeading>
      <Label>App Logo (optional)</Label>
      <Content className="text-sm">
        Choose a square, static image less than 1mb.
      </Content>

      {logoDataUrl ? (
        /* n.b. if you change the dimensions here, make sure to also
           change them in pages/platform/oauth/start.tsx (and make sure
           they work with all existing images) */
        <div className="w-12 h-12 relative">
          <div className="absolute w-full h-full group">
            <div className="hidden group-hover:block transition duration-300 w-full h-full place-content-center text-center bg-black/50">
              <Button
                variant="destructive"
                size="mini"
                className="p-0 m-0 bg-transparent border-none"
                onClick={() => {
                  setLogoDataUrl(null);
                }}
              >
                <TrashIcon height="1.5em" />
              </Button>
            </div>
          </div>
          <img className="w-12 h-12" src={logoDataUrl} />
        </div>
      ) : (
        <UploadLogoInput onDataUrl={setLogoDataUrl} />
      )}

      <TextInput
        value={appName}
        onChange={setAppName}
        label="Unique name"
        placeholder="Unique name"
        required={true}
      />
      <TextInput
        value={homepageUrl}
        onChange={setHomepageUrl}
        label="Homepage URL (optional)"
        placeholder="Your homepage, e.g. https://example.com"
      />
      <TextInput
        value={appPrivacyPolicyLink}
        onChange={setAppPrivacyPolicyLink}
        label="Privacy Policy URL (optional)"
        placeholder="Your public privacy policy"
      />
      <TextInput
        value={appTosLink}
        onChange={setAppTosLink}
        label="Terms of Service URL (optional)"
        placeholder="Your public Terms of Service"
      />
      <TextInput
        value={supportEmail}
        onChange={setSupportEmail}
        label="Support email (optional)"
        placeholder="Your support email"
      />
      <Button loading={isLoading} type="submit">
        Add OAuth App
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </form>
  );
}

function CreateApp() {
  const [showForm, setShowForm] = useState(false);

  if (!showForm) {
    return (
      <Button variant="secondary" onClick={() => setShowForm(true)}>
        <PlusIcon height={14} /> Create OAuth App
      </Button>
    );
  }

  return <CreateAppForm onClose={() => setShowForm(false)} />;
}

function Layout({
  focusedApp,
  children,
}: PropsWithChildren<{ focusedApp?: OAuthApp }>) {
  const router = useReadyRouter();
  const params = new URLSearchParams(encode(router.query));
  params.delete('oauthapp');
  const href = `${router.pathname}?${params.toString()}`;

  return (
    <div className="flex flex-col p-4 gap-4">
      {focusedApp ? (
        <div className="flex flex-row gap-1">
          <Link href={href} className="underline">
            <SectionHeading>OAuth Apps</SectionHeading>
          </Link>
          <SectionHeading>/</SectionHeading>{' '}
          <SectionHeading>{focusedApp.appName}</SectionHeading>
        </div>
      ) : (
        <SectionHeading>OAuth Apps</SectionHeading>
      )}
      {children}
    </div>
  );
}

export default function OAuthApps({ appId }: { appId: string }) {
  const router = useReadyRouter();
  const [secretToCopy, setSecretToCopy] = useState<{
    clientId: string;
    clientSecret: string;
  } | null>(null);
  const authResponse = useAuthedFetch<OAuthAppsResponse>(
    `${config.apiURI}/dash/apps/${appId}/oauth-apps`,
  );

  if (authResponse.isLoading) {
    return (
      <Layout>
        <Loading />
      </Layout>
    );
  }

  const handleCreateApp = (app: OAuthApp) => {
    authResponse.mutate({
      ...data,
      apps: [app, ...(data?.apps || [])],
    });
    const params = new URLSearchParams(encode(router.query));
    params.set('oauthapp', app.id);
    const href = `${router.pathname}?${params.toString()}`;
    router.push(href);
  };

  const handleUpdateApp = (app: OAuthApp) => {
    authResponse.mutate({
      ...data,
      apps: (data?.apps || []).map((a) =>
        a.id === app.id ? { ...app, clients: a.clients } : a,
      ),
    });
  };

  const handleDeleteApp = (app: OAuthApp) => {
    authResponse.mutate({
      ...data,
      apps: (data?.apps || []).filter((a) => a.id !== app.id),
    });
  };

  const handleDeleteClientSecret = (clientSecret: OAuthAppClientSecret) => {
    authResponse.mutate({
      ...data,
      apps: (data?.apps || []).map((a) => {
        return {
          ...a,
          clients: (a.clients || [])?.map((c) => {
            return {
              ...c,
              clientSecrets: (c.clientSecrets || []).filter(
                (c) => c.id !== clientSecret.id,
              ),
            };
          }),
        };
      }),
    });
  };

  const handleCreateClientSecret = ({
    clientSecret,
    secretValue,
  }: {
    clientSecret: OAuthAppClientSecret;
    secretValue: string;
  }) => {
    authResponse.mutate({
      ...data,
      apps: (data?.apps || []).map((a) => {
        return {
          ...a,
          clients: (a.clients || [])?.map((c) => {
            return {
              ...c,
              clientSecrets: (c.clientSecrets || []).concat([clientSecret]),
            };
          }),
        };
      }),
    });
    setSecretToCopy({
      clientId: clientSecret.clientId,
      clientSecret: secretValue,
    });
  };

  const handleCreateClient = ({
    client,
    clientSecret,
    secretValue,
  }: {
    client: OAuthAppClient;
    clientSecret: OAuthAppClientSecret;
    secretValue: string;
  }) => {
    const oauthAppId = client.oauthAppId;
    authResponse.mutate({
      ...data,
      apps: (data?.apps || []).map((a) => {
        if (a.id !== oauthAppId) {
          return a;
        }
        return {
          ...a,
          clients: [
            { ...client, secrets: [clientSecret] },
            ...(a.clients || []),
          ],
        };
      }),
    });
    setSecretToCopy({ clientId: client.clientId, clientSecret: secretValue });
  };

  const handleUpdateClient = (client: OAuthAppClient) => {
    const oauthAppId = client.oauthAppId;
    authResponse.mutate({
      ...data,
      apps: (data?.apps || []).map((a) => {
        if (a.id !== oauthAppId) {
          return a;
        }
        return {
          ...a,
          clients: (a.clients || []).map((c) =>
            c.clientId === client.clientId
              ? { ...client, clientSecrets: c.clientSecrets }
              : c,
          ),
        };
      }),
    });
  };

  const handleDeleteClient = (client: OAuthAppClient) => {
    const oauthAppId = client.oauthAppId;
    authResponse.mutate({
      ...data,
      apps: (data?.apps || []).map((a) => {
        if (a.id !== oauthAppId) {
          return a;
        }
        return {
          ...a,
          clients: (a.clients || []).filter(
            (c) => c.clientId !== client.clientId,
          ),
        };
      }),
    });
  };

  const data = authResponse.data;

  if (!data) {
    return (
      <Layout>
        <div className="mx-auto flex max-w-xl flex-col gap-4 p-2">
          <ErrorMessage>
            <div className="flex gap-2">
              There was an error loading the data.{' '}
              <Button
                variant="subtle"
                size="mini"
                onClick={() =>
                  authResponse.mutate(undefined, { revalidate: true })
                }
              >
                Refresh.
              </Button>
            </div>
          </ErrorMessage>
        </div>
      </Layout>
    );
  }

  const oauthAppId = router.query.oauthapp;
  const focusedApp = data.apps.find((a) => a.id === oauthAppId);

  return (
    <OAuthAppContext.Provider
      value={{
        appId,
        onCreateApp: handleCreateApp,
        onUpdateApp: handleUpdateApp,
        onDeleteApp: handleDeleteApp,
        onCreateClient: handleCreateClient,
        onUpdateClient: handleUpdateClient,
        onDeleteClient: handleDeleteClient,
        onCreateClientSecret: handleCreateClientSecret,
        onDeleteClientSecret: handleDeleteClientSecret,
      }}
    >
      <Layout focusedApp={focusedApp}>
        <div className="flex flex-col p-4 gap-4">
          {secretToCopy ? (
            <Dialog
              open={Boolean(secretToCopy)}
              onClose={() => setSecretToCopy(null)}
            >
              <SubsectionHeading>Copy your client secret</SubsectionHeading>
              <div className="flex flex-col gap-2 p-2">
                <Content>
                  <p>
                    Copy and save your client secret somewhere safe. Instant
                    does not keep a copy of the secret. You will have to
                    generate a new secret if this one is lost.
                  </p>
                  <p>
                    If you're performing the OAuth flow from the server, you'll
                    need the client secret to create new access tokens.
                  </p>
                </Content>
                <div>
                  <Copyable value={secretToCopy.clientId} label="Client Id" />
                </div>
                <div>
                  <Copyable
                    value={secretToCopy.clientSecret}
                    label="Client secret"
                    defaultHidden={true}
                  />
                </div>
              </div>
            </Dialog>
          ) : null}
          {focusedApp ? (
            <App app={focusedApp} />
          ) : (
            <div className="flex flex-col gap-4 ">
              <Content className="max-w-md">
                OAuth apps allow you to perform actions on behalf of an Instant
                user, like creating apps in their account or managing their
                schema.
              </Content>
              <Apps apps={data.apps} />
              <div className="max-w-md">
                <CreateApp />
              </div>
            </div>
          )}
        </div>
      </Layout>
    </OAuthAppContext.Provider>
  );
}

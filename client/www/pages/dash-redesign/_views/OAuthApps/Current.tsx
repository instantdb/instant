import { useState } from 'react';
import { PlusIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import {
  ActionForm,
  Button,
  Content,
  Copyable,
  Divider,
  Label,
  SectionHeading,
  SubsectionHeading,
  TextInput,
} from '@/components/ui';
import {
  DashShell,
  EphemeralError,
  EphemeralLoading,
  useEphemeralInstantApp,
} from '../_shared';
import { OAuthAppsSubState } from './index';

const MOCK_APPS = [
  {
    id: 'oapp-1',
    appName: 'Acme CLI',
    homepageUrl: 'https://acme.example.com',
  },
  {
    id: 'oapp-2',
    appName: 'Internal Tools',
    homepageUrl: 'https://tools.internal.example.com',
  },
];

const MOCK_FOCUSED_APP = {
  id: 'oapp-1',
  appName: 'Acme CLI',
  homepageUrl: 'https://acme.example.com',
  appPrivacyPolicyLink: 'https://acme.example.com/privacy',
  appTosLink: 'https://acme.example.com/tos',
  supportEmail: 'support@acme.example.com',
  clients: [
    {
      id: 'client-1',
      clientName: 'Production',
      clientId: 'cli_PROD_abc123',
      authorizedRedirectUrls: ['https://acme.example.com/oauth/callback'],
    },
    {
      id: 'client-2',
      clientName: 'Staging',
      clientId: 'cli_STAGE_def456',
      authorizedRedirectUrls: [
        'https://staging.acme.example.com/oauth/callback',
      ],
    },
  ],
};

const MOCK_CLIENT_SECRET =
  'cs_REDACTED_THIS_IS_A_DEMO_VALUE_DO_NOT_USE_ANYWHERE_1234567890abcdef';

function MockLogo() {
  return (
    <div className="flex h-12 w-12 place-content-center items-center rounded-lg border-2 border-dashed border-gray-400 bg-gray-100 dark:border-neutral-600 dark:bg-neutral-700">
      <ArrowUpTrayIcon height="1em" className="m-auto" />
    </div>
  );
}

function Crumbs({ focusedAppName }: { focusedAppName?: string }) {
  if (!focusedAppName) {
    return <SectionHeading>OAuth Apps</SectionHeading>;
  }
  return (
    <div className="flex flex-row gap-1">
      <a href="#" className="underline">
        <SectionHeading>OAuth Apps</SectionHeading>
      </a>
      <SectionHeading>/</SectionHeading>
      <SectionHeading>{focusedAppName}</SectionHeading>
    </div>
  );
}

function ListSubView() {
  return (
    <>
      <Crumbs />
      <div className="flex max-w-md flex-col gap-6">
        {MOCK_APPS.map((a) => (
          <div key={a.id} className="flex flex-col gap-4">
            <a
              href="#"
              className="flex w-full cursor-pointer flex-row items-center gap-4 p-2 transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-neutral-700"
            >
              <MockLogo />
              <SectionHeading>{a.appName}</SectionHeading>
            </a>
            <Divider />
          </div>
        ))}
      </div>
      <Button variant="secondary">
        <PlusIcon height={14} /> Create OAuth App
      </Button>
    </>
  );
}

function CreateAppSubView() {
  const [appName, setAppName] = useState('');
  const [homepageUrl, setHomepageUrl] = useState('');
  const [privacyPolicy, setPrivacyPolicy] = useState('');
  const [tos, setTos] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  return (
    <>
      <Crumbs />
      <ActionForm className="flex max-w-md flex-col gap-4">
        <SubsectionHeading>Create a new OAuth App</SubsectionHeading>
        <div className="flex items-center gap-3">
          <MockLogo />
          <Content className="text-sm">Upload a logo (optional).</Content>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Unique name</Label>
          <TextInput
            value={appName}
            onChange={setAppName}
            placeholder="Acme CLI"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Homepage URL</Label>
          <TextInput
            value={homepageUrl}
            onChange={setHomepageUrl}
            placeholder="https://acme.example.com"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Privacy policy URL</Label>
          <TextInput
            value={privacyPolicy}
            onChange={setPrivacyPolicy}
            placeholder="https://acme.example.com/privacy"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Terms of service URL</Label>
          <TextInput
            value={tos}
            onChange={setTos}
            placeholder="https://acme.example.com/tos"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Support email</Label>
          <TextInput
            value={supportEmail}
            onChange={setSupportEmail}
            placeholder="support@acme.example.com"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Create app
          </Button>
        </div>
      </ActionForm>
    </>
  );
}

function AppDetailSubView() {
  const app = MOCK_FOCUSED_APP;
  return (
    <>
      <Crumbs focusedAppName={app.appName} />
      <div className="flex max-w-2xl flex-col gap-6">
        <div className="flex items-center gap-4">
          <MockLogo />
          <div className="flex flex-col">
            <SubsectionHeading>{app.appName}</SubsectionHeading>
            <a
              href={app.homepageUrl}
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              {app.homepageUrl}
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label>Privacy policy</Label>
              <div className="truncate">{app.appPrivacyPolicyLink}</div>
            </div>
            <div>
              <Label>Terms of service</Label>
              <div className="truncate">{app.appTosLink}</div>
            </div>
            <div>
              <Label>Support email</Label>
              <div>{app.supportEmail}</div>
            </div>
          </div>
          <div>
            <Button variant="secondary" size="mini">
              Edit details
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <SubsectionHeading>Clients</SubsectionHeading>
          <Button variant="secondary" size="mini">
            <PlusIcon height={12} /> New client
          </Button>
        </div>
        <div className="divide-y rounded-sm border bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800">
          {app.clients.map((c) => (
            <div key={c.id} className="flex flex-col gap-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{c.clientName}</div>
                <div className="font-mono text-xs text-gray-500 dark:text-neutral-400">
                  {c.clientId}
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-neutral-400">
                {c.authorizedRedirectUrls[0]}
              </div>
            </div>
          ))}
        </div>

        <div>
          <SubsectionHeading>Delete {app.appName}</SubsectionHeading>
          <Content className="dark:text-neutral-400">
            <p>
              Deleting this OAuth app will revoke all client access. This cannot
              be undone.
            </p>
          </Content>
          <div className="mt-3">
            <Button variant="destructive" size="mini">
              Delete app
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function CreateClientSubView() {
  const app = MOCK_FOCUSED_APP;
  const [clientName, setClientName] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  return (
    <>
      <Crumbs focusedAppName={app.appName} />
      <ActionForm className="flex max-w-md flex-col gap-4">
        <SubsectionHeading>Create a new Client</SubsectionHeading>
        <div className="flex flex-col gap-1">
          <Label>Client name</Label>
          <TextInput
            value={clientName}
            onChange={setClientName}
            placeholder="Production"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Authorized redirect URL</Label>
          <TextInput
            value={redirectUrl}
            onChange={setRedirectUrl}
            placeholder="https://acme.example.com/oauth/callback"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Create client
          </Button>
        </div>
      </ActionForm>
    </>
  );
}

function ClientSecretSubView() {
  return (
    <>
      <Crumbs focusedAppName={MOCK_FOCUSED_APP.appName} />
      <div className="flex max-w-md flex-col gap-3 rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <SubsectionHeading>Copy your client secret</SubsectionHeading>
        <Content>
          <p>
            Copy and save your client secret somewhere safe. Instant does not
            keep a copy of the secret. You will have to generate a new one if
            this is lost.
          </p>
        </Content>
        <Copyable
          value={MOCK_CLIENT_SECRET}
          label="Client secret"
          defaultHidden={true}
        />
        <div className="flex justify-end">
          <Button variant="primary">Done</Button>
        </div>
      </div>
    </>
  );
}

function OAuthAppsBody({ sub }: { sub: OAuthAppsSubState }) {
  return (
    <div className="flex flex-col gap-4 p-4">
      {sub === 'list' && <ListSubView />}
      {sub === 'create-app' && <CreateAppSubView />}
      {sub === 'app-detail' && <AppDetailSubView />}
      {sub === 'create-client' && <CreateClientSubView />}
      {sub === 'client-secret' && <ClientSecretSubView />}
    </div>
  );
}

export function Current({ sub }: { sub: OAuthAppsSubState }) {
  const ephemeral = useEphemeralInstantApp();
  if (ephemeral.status === 'loading') return <EphemeralLoading />;
  if (ephemeral.status === 'error') {
    return <EphemeralError error={ephemeral.error} reset={ephemeral.reset} />;
  }
  return (
    <DashShell active="oauth-apps" app={ephemeral.app}>
      <OAuthAppsBody sub={sub} />
    </DashShell>
  );
}

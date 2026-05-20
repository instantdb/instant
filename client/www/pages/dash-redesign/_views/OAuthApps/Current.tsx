import { useState } from 'react';
import { PlusIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import {
  ActionForm,
  Button,
  Content,
  SectionHeading,
  SubsectionHeading,
  TextInput,
} from '@/components/ui';
import {
  DashPage,
  DashNotice,
  DashPanel,
  DashPanelHeader,
  DashRow,
  DashSecretField,
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
    <div className="flex h-12 w-12 place-content-center items-center rounded-lg border border-dashed border-gray-300 bg-[#fbfaf8] text-gray-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
      <ArrowUpTrayIcon height="1em" className="m-auto" />
    </div>
  );
}

function Crumbs({ focusedAppName }: { focusedAppName?: string }) {
  if (!focusedAppName) {
    return <SectionHeading>OAuth Apps</SectionHeading>;
  }
  return (
    <div>
      <a
        href="#"
        className="text-sm font-medium text-gray-500 hover:text-gray-950 dark:text-neutral-400 dark:hover:text-white"
      >
        OAuth Apps
      </a>
      <SectionHeading>{focusedAppName}</SectionHeading>
    </div>
  );
}

function ListSubView() {
  return (
    <>
      <Crumbs />
      <DashPanel>
        <DashPanelHeader
          title="Registered apps"
          description="OAuth apps let third-party clients request access through Instant."
          action={
            <Button variant="secondary">
              <PlusIcon height={14} /> Create app
            </Button>
          }
        />
        <div className="grid gap-3 md:grid-cols-2">
          {MOCK_APPS.map((a) => (
            <a
              key={a.id}
              href="#"
              className="flex w-full cursor-pointer flex-row items-center gap-4 rounded-md border border-gray-200 bg-[#fbfaf8] p-3 transition-colors duration-200 hover:border-gray-300 hover:bg-white dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
            >
              <MockLogo />
              <div className="min-w-0">
                <SubsectionHeading>{a.appName}</SubsectionHeading>
                <div className="truncate text-sm text-gray-500 dark:text-neutral-400">
                  {a.homepageUrl}
                </div>
              </div>
            </a>
          ))}
        </div>
      </DashPanel>
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
      <DashPanel>
        <DashPanelHeader
          title="Create OAuth app"
          description="Add app details shown during authorization."
        />
        <ActionForm className="grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-3 md:col-span-2">
            <MockLogo />
            <Content className="text-sm">Upload a logo (optional).</Content>
          </div>
          <TextInput
            label="Unique name"
            size="large"
            value={appName}
            onChange={setAppName}
            placeholder="Acme CLI"
          />
          <TextInput
            label="Homepage URL"
            size="large"
            value={homepageUrl}
            onChange={setHomepageUrl}
            placeholder="https://acme.example.com"
          />
          <TextInput
            label="Privacy policy URL"
            size="large"
            value={privacyPolicy}
            onChange={setPrivacyPolicy}
            placeholder="https://acme.example.com/privacy"
          />
          <TextInput
            label="Terms of service URL"
            size="large"
            value={tos}
            onChange={setTos}
            placeholder="https://acme.example.com/tos"
          />
          <TextInput
            label="Support email"
            size="large"
            value={supportEmail}
            onChange={setSupportEmail}
            placeholder="support@acme.example.com"
          />
          <div className="flex items-end justify-end gap-2">
            <Button variant="secondary" size="large" type="button">
              Cancel
            </Button>
            <Button variant="primary" size="large" type="submit">
              Create app
            </Button>
          </div>
        </ActionForm>
      </DashPanel>
    </>
  );
}

function AppDetailSubView() {
  const app = MOCK_FOCUSED_APP;
  return (
    <>
      <Crumbs focusedAppName={app.appName} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <DashPanel>
            <div className="flex items-center gap-4">
              <MockLogo />
              <div className="min-w-0">
                <SubsectionHeading>{app.appName}</SubsectionHeading>
                <a
                  href={app.homepageUrl}
                  className="truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  {app.homepageUrl}
                </a>
              </div>
            </div>
          </DashPanel>

          <DashPanel>
            <DashPanelHeader
              title="Clients"
              action={
                <Button variant="secondary" size="mini">
                  <PlusIcon height={12} /> New client
                </Button>
              }
            />
            <div>
              {app.clients.map((c) => (
                <DashRow
                  key={c.id}
                  label={c.clientName}
                  value={c.authorizedRedirectUrls[0]}
                  action={
                    <div className="font-mono text-xs text-gray-500 dark:text-neutral-400">
                      {c.clientId}
                    </div>
                  }
                />
              ))}
            </div>
          </DashPanel>
        </div>

        <div className="flex flex-col gap-4">
          <DashPanel>
            <DashPanelHeader title="App details" />
            <div>
              <DashRow
                label="Privacy policy"
                value={app.appPrivacyPolicyLink}
              />
              <DashRow label="Terms of service" value={app.appTosLink} />
              <DashRow label="Support email" value={app.supportEmail} />
            </div>
            <Button className="mt-3" variant="secondary" size="mini">
              Edit details
            </Button>
          </DashPanel>

          <DashPanel>
            <DashPanelHeader
              title={`Delete ${app.appName}`}
              description="Revoke all client access for this OAuth app."
            />
            <Button variant="destructive" size="mini">
              Delete app
            </Button>
          </DashPanel>
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
      <DashPanel className="max-w-2xl">
        <DashPanelHeader title="Create client" />
        <ActionForm className="grid gap-4">
          <TextInput
            label="Client name"
            size="large"
            value={clientName}
            onChange={setClientName}
            placeholder="Production"
          />
          <TextInput
            label="Authorized redirect URL"
            size="large"
            value={redirectUrl}
            onChange={setRedirectUrl}
            placeholder="https://acme.example.com/oauth/callback"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="large" type="button">
              Cancel
            </Button>
            <Button variant="primary" size="large" type="submit">
              Create client
            </Button>
          </div>
        </ActionForm>
      </DashPanel>
    </>
  );
}

function ClientSecretSubView() {
  return (
    <>
      <Crumbs focusedAppName={MOCK_FOCUSED_APP.appName} />
      <DashPanel className="max-w-2xl">
        <DashPanelHeader title="Copy your client secret" />
        <DashNotice tone="warning">
          Copy and save your client secret somewhere safe. Instant does not keep
          a copy of the secret. You will have to generate a new one if this is
          lost.
        </DashNotice>
        <DashSecretField
          className="mt-4"
          label="Client secret"
          value={MOCK_CLIENT_SECRET}
          description="Shown once"
        />
        <div className="mt-4 flex justify-end">
          <Button variant="primary" size="large">
            Done
          </Button>
        </div>
      </DashPanel>
    </>
  );
}

function OAuthAppsBody({ sub }: { sub: OAuthAppsSubState }) {
  return (
    <DashPage size="wide">
      {sub === 'list' && <ListSubView />}
      {sub === 'create-app' && <CreateAppSubView />}
      {sub === 'app-detail' && <AppDetailSubView />}
      {sub === 'create-client' && <CreateClientSubView />}
      {sub === 'client-secret' && <ClientSecretSubView />}
    </DashPage>
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

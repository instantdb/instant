import { useEffect, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import {
  Button,
  Content,
  Dialog,
  NavTabBar,
  SectionHeading,
  SubsectionHeading,
  TabItem,
} from '@/components/ui';
import {
  BackToAppsLink,
  DashEmptyState,
  DashNotice,
  DashPage,
  DashPanel,
  DashPanelHeader,
  DashSecretField,
  MockTopBar,
} from '../_shared';
import { UserSettingsSubState } from './index';

const MOCK_EMAIL = 'sto.pa@instantdb.com';
const MOCK_TOKEN = 'instnt_pat_REDACTED_TOKEN_FOR_DEMO_PURPOSES_ONLY_12345678';

const TABS: TabItem[] = [
  { id: 'tokens', label: 'Access Tokens' },
  { id: 'oauth', label: 'OAuth Apps' },
  { id: 'invites', label: 'Invites' },
];

function UserSettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#fbfaf8] dark:bg-neutral-950 dark:text-white">
      <MockTopBar leftExtra={<BackToAppsLink />} />
      {children}
    </div>
  );
}

function UserSettingsHeader({
  activeTab,
  onSelectTab,
}: {
  activeTab: string;
  onSelectTab: (id: string) => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionHeading>User Settings</SectionHeading>
          <div className="mt-1 text-sm text-gray-600 dark:text-neutral-400">
            {MOCK_EMAIL}
          </div>
        </div>
        <Button variant="destructive">Log Out</Button>
      </div>
      <NavTabBar
        className="border-transparent"
        tabs={TABS}
        selectedId={activeTab}
        onSelect={(t) => onSelectTab(t.id)}
      />
    </>
  );
}

function TokensTab() {
  return (
    <DashPanel>
      <DashPanelHeader
        title={
          <>
            Personal Access Tokens <sup className="text-xs">Beta</sup>
          </>
        }
        description={
          <>
            Create tokens for the platform API.{' '}
            <a className="underline dark:text-white" href="/labs/platform_demo">
              Read the guide
            </a>
            .
          </>
        }
        action={
          <Button variant="primary" size="mini">
            <PlusIcon className="mr-1 h-4 w-4" />
            New token
          </Button>
        }
      />
      <DashEmptyState
        title="No tokens yet"
        description="Create a token when a local tool, script, or service needs Platform API access."
      />
    </DashPanel>
  );
}

function OAuthTab() {
  return (
    <DashPanel>
      <DashPanelHeader
        title="Authorized OAuth Apps"
        description="Apps that can access your Instant account."
      />
      <DashEmptyState
        title="No authorized OAuth apps"
        description="Apps you authorize to access your Instant account will appear here."
      />
    </DashPanel>
  );
}

function InvitesTab() {
  return (
    <DashPanel>
      <DashPanelHeader
        title="Team invites"
        description="Organization invitations sent to this account."
      />
      <DashEmptyState
        title="No pending invites"
        description="Organization invitations sent to this account will appear here."
      />
    </DashPanel>
  );
}

function CopyTokenDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      title="Copy Token"
      open={open}
      onClose={onClose}
      className="max-w-2xl"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <SubsectionHeading>Copy your token</SubsectionHeading>
          <Content className="mt-1">
            This token is only shown once. Store it before closing this dialog.
          </Content>
        </div>
        <DashNotice tone="warning">
          Instant does not keep a copy of the token. You will have to generate a
          new token if this one is lost.
        </DashNotice>
        <DashSecretField
          label="Personal access token"
          value={MOCK_TOKEN}
          description="Shown once"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function Current({ sub }: { sub: UserSettingsSubState }) {
  const activeTab =
    sub === 'oauth' ? 'oauth' : sub === 'invites' ? 'invites' : 'tokens';
  const showCopyDialog = sub === 'token-created';
  // Local state for dialog so closing it doesn't require a sidebar nav
  const [dialogOpen, setDialogOpen] = useState(true);
  useEffect(() => {
    if (showCopyDialog) setDialogOpen(true);
  }, [showCopyDialog]);

  return (
    <UserSettingsShell>
      <DashPage size="default">
        <UserSettingsHeader
          activeTab={activeTab}
          onSelectTab={() => {
            /* sidebar drives the active tab */
          }}
        />
        {activeTab === 'tokens' && <TokensTab />}
        {activeTab === 'oauth' && <OAuthTab />}
        {activeTab === 'invites' && <InvitesTab />}
        {showCopyDialog && (
          <CopyTokenDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
          />
        )}
      </DashPage>
    </UserSettingsShell>
  );
}

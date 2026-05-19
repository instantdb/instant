import { useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import {
  ActionForm,
  Button,
  Content,
  Copyable,
  Dialog,
  Label,
  NavTabBar,
  SectionHeading,
  SubsectionHeading,
  TabItem,
} from '@/components/ui';
import { BackToAppsLink, MockTopBar } from '../_shared';
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
    <div className="flex min-h-screen flex-col bg-gray-100 dark:bg-neutral-900 dark:text-white">
      <MockTopBar leftExtra={<BackToAppsLink />} />
      <div className="mx-auto w-full max-w-4xl px-8 pt-8">{children}</div>
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
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-baseline pb-4 md:flex-row md:gap-4">
          <div className="text-lg font-semibold">User Settings</div>
          <div className="text-gray-600 dark:text-neutral-400">
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
    <div className="mx-auto mt-2 flex flex-1 flex-col">
      <div className="flex flex-row items-center justify-between">
        <div className="pt-1 pb-4">
          <div className="prose dark:text-neutral-300">
            <SectionHeading className="font-bold">
              Personal Access Tokens <sup className="text-sm">[BETA]</sup>
            </SectionHeading>
            <p>
              Welcome to the Platform Beta! You can create{' '}
              <code className="dark:bg-neutral-800 dark:text-white">
                Personal Access Tokens
              </code>{' '}
              here. <br />
              <a className="dark:text-white" href="/labs/platform_demo">
                Take a look at this guide
              </a>{' '}
              to see how to use the platform API, and create apps on demand!
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Button variant="primary" size="mini">
          <PlusIcon className="mr-1 h-4 w-4" />
          New access token
        </Button>
        <div className="flex flex-col items-center justify-center py-8 text-gray-500 dark:text-neutral-400">
          <p className="text-sm">No personal access tokens created yet.</p>
        </div>
      </div>
    </div>
  );
}

function OAuthTab() {
  return (
    <div className="mt-2 flex max-w-2xl flex-1 flex-col p-4">
      <div className="flex flex-row items-center gap-4 pb-4">
        <SectionHeading className="font-bold">
          Authorized OAuth Apps
        </SectionHeading>
      </div>
      <Content className="dark:text-neutral-400">
        <p>
          Below are any OAuth apps that you have granted access to your Instant
          Account.
        </p>
      </Content>
      <div className="mt-6 text-sm text-gray-500 italic dark:text-neutral-400">
        You haven't authorized any OAuth apps yet.
      </div>
    </div>
  );
}

function InvitesTab() {
  return (
    <div className="mt-2 flex w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="mb-2 flex text-4xl">📫</div>
      <SectionHeading>Team Invites</SectionHeading>
      <div className="flex flex-1 flex-col gap-4">
        <Content className="dark:text-netural-400 text-gray-400 italic">
          You have no pending invites.
        </Content>
      </div>
    </div>
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
    <Dialog title="Copy Token" open={open} onClose={onClose}>
      <SubsectionHeading>Copy your token</SubsectionHeading>
      <div className="mt-2 flex min-w-0 flex-col gap-2">
        <Content>
          <p>
            Copy and save your token somewhere safe. Instant does not keep a
            copy of the token. You will have to generate a new token if this one
            is lost.
          </p>
        </Content>
        <div className="w-full max-w-full min-w-0 overflow-x-auto">
          <Copyable value={MOCK_TOKEN} label="Token" defaultHidden={true} />
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

  return (
    <UserSettingsShell>
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
    </UserSettingsShell>
  );
}

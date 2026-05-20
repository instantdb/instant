import { useEffect, useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import {
  ActionForm,
  Button,
  Checkbox,
  Content,
  Dialog,
  Label,
  SectionHeading,
  Select,
  SubsectionHeading,
  TextInput,
} from '@/components/ui';
import {
  DashShell,
  DashPage,
  DashPanel,
  DashPanelHeader,
  DashRow,
  DashNotice,
  DashSecretField,
  EphemeralError,
  EphemeralLoading,
  useEphemeralInstantApp,
} from '../_shared';
import { AdminSubState } from './index';

function DocsCard({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="block cursor-pointer justify-start rounded-md border border-gray-200 bg-[#fbfaf8] p-3 transition-colors hover:border-gray-300 hover:bg-white dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700 dark:hover:bg-neutral-900"
    >
      <div>
        <div className="font-semibold text-gray-950 dark:text-white">
          {title}
        </div>
        <div className="text-sm text-gray-500 dark:text-neutral-400">
          {children}
        </div>
      </div>
    </a>
  );
}

function AdminBody({
  adminToken,
  appTitle,
}: {
  adminToken: string;
  appTitle: string;
}) {
  const [appName, setAppName] = useState(appTitle);

  const members = [
    {
      id: '1',
      email: 'collab@example.com',
      role: 'collaborator' as const,
    },
    { id: '2', email: 'admin@example.com', role: 'admin' as const },
  ];

  return (
    <DashPage size="wide">
      <div>
        <SectionHeading>Admin</SectionHeading>
        <Content className="mt-1">
          Manage backend access, app ownership, and destructive operations for
          this app.
        </Content>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="flex flex-col gap-4">
          <DashPanel>
            <DashPanelHeader
              title="Admin SDK"
              description="Use this token from trusted backend environments only."
            />
            <div className="space-y-4">
              <DocsCard href="/docs/backend" title="Instant and your backend">
                Learn how to integrate Instant with your backend.
              </DocsCard>
              <Content>
                Regenerate the token if it has been exposed or needs to be
                rotated.
              </Content>
              <DashSecretField
                label="Secret"
                value={adminToken}
                description="Admin token"
              />
            </div>
          </DashPanel>

          <DashPanel>
            <DashPanelHeader
              title="Danger zone"
              description="These actions permanently remove app data."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="destructive">
                <TrashIcon height="1rem" /> Clear app
              </Button>
              <Button variant="destructive">
                <TrashIcon height="1rem" /> Delete app
              </Button>
            </div>
          </DashPanel>
        </div>

        <div className="flex flex-col gap-4">
          <DashPanel>
            <DashPanelHeader title="App settings" />
            <form
              className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              onSubmit={(e) => e.preventDefault()}
            >
              <TextInput
                label="App name"
                size="large"
                placeholder="My awesome app"
                value={appName}
                onChange={setAppName}
              />
              <Button variant="secondary" size="large">
                Save name
              </Button>
            </form>
          </DashPanel>

          <DashPanel>
            <DashPanelHeader
              title="Team members"
              description="Admins can manage app settings and team access."
              action={<Button variant="secondary">Invite member</Button>}
            />
            {members.length ? (
              <div>
                {members.map((member) => (
                  <DashRow
                    key={member.id}
                    label={member.email}
                    value={member.role[0].toUpperCase() + member.role.slice(1)}
                    action={
                      <Button size="mini" variant="secondary">
                        Edit
                      </Button>
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-neutral-400">
                No team members
              </div>
            )}
          </DashPanel>

          <DashPanel>
            <DashPanelHeader
              title="Transfer app"
              description="Move this app to another organization."
            />
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="flex flex-col gap-1">
                <Label>Destination organization</Label>
                <div className="flex min-h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm shadow-xs dark:border-neutral-700 dark:bg-neutral-900">
                  <span>my-new-org</span>
                  <span className="text-gray-400">▾</span>
                </div>
              </div>
              <Button variant="secondary">Transfer</Button>
            </div>
          </DashPanel>
        </div>
      </div>
    </DashPage>
  );
}

function EditMemberDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Mock target: a collaborator
  return (
    <Dialog title="Edit Member" open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <SubsectionHeading>Edit team member</SubsectionHeading>
          <Content className="mt-1">
            collab@example.com currently has collaborator access.
          </Content>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-4 border-b border-gray-100 p-3 dark:border-neutral-800">
            <div>
              <div className="text-sm font-semibold text-gray-950 dark:text-white">
                Role
              </div>
              <Content className="text-sm">
                Allow app and schema changes.
              </Content>
            </div>
            <Button variant="primary">Promote</Button>
          </div>
          <div className="flex items-center justify-between gap-4 p-3">
            <div>
              <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                Remove access
              </div>
              <Content className="text-sm">
                Remove this member from the app.
              </Content>
            </div>
            <Button variant="destructive">Remove</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function InviteMemberDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'collaborator'>('collaborator');
  return (
    <Dialog title="Invite Members" open={open} onClose={onClose}>
      <ActionForm className="flex flex-col gap-4">
        <SubsectionHeading>Invite a team member</SubsectionHeading>
        <TextInput
          label="Email"
          type="email"
          size="large"
          value={email}
          onChange={setEmail}
        />
        <div className="flex flex-col gap-1">
          <Label>Role</Label>
          <Select
            size="lg"
            value={role}
            onChange={(o) => o && setRole(o.value as 'admin' | 'collaborator')}
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'collaborator', label: 'Collaborator' },
            ]}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-neutral-800">
          <Button
            type="button"
            variant="secondary"
            size="large"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="large"
            disabled={!email}
          >
            Invite
          </Button>
        </div>
      </ActionForm>
    </Dialog>
  );
}

function ClearAppDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [ok, setOk] = useState(false);
  return (
    <Dialog title="Clear App" open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SubsectionHeading className="text-red-600">
          Clear app
        </SubsectionHeading>
        <DashNotice tone="danger">
          <p>
            Clearing an app will irreversibly delete all namespaces, triples,
            and permissions.
          </p>
          <p>
            All other data like app id, admin token, users, billing, team
            members, etc. will remain.
          </p>
          <p>
            This is equivalent to deleting all your namespaces in the explorer
            and clearing your permissions.
          </p>
        </DashNotice>
        <Checkbox
          checked={ok}
          onChange={(c) => setOk(c)}
          label="I understand and want to clear this app."
        />
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-neutral-800">
          <Button variant="secondary" size="large" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="large" disabled={!ok}>
            Clear data
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DeleteAppDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [ok, setOk] = useState(false);
  return (
    <Dialog title="Delete App" open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SubsectionHeading className="text-red-600">
          Delete app
        </SubsectionHeading>
        <DashNotice tone="danger">
          Deleting an app will irreversibly delete all associated data.
        </DashNotice>
        <Checkbox
          checked={ok}
          onChange={(c) => setOk(c)}
          label="I understand and want to delete this app."
        />
        <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-neutral-800">
          <Button variant="secondary" size="large" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" size="large" disabled={!ok}>
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function Current({ sub = 'default' }: { sub?: AdminSubState }) {
  const ephemeral = useEphemeralInstantApp();
  const [openSub, setOpenSub] = useState<AdminSubState>(sub);
  useEffect(() => {
    if (sub !== 'default') setOpenSub(sub);
  }, [sub]);
  if (ephemeral.status === 'loading') return <EphemeralLoading />;
  if (ephemeral.status === 'error') {
    return <EphemeralError error={ephemeral.error} reset={ephemeral.reset} />;
  }
  const app = ephemeral.app;
  const close = () => setOpenSub('default');
  return (
    <DashShell active="admin" app={app}>
      <AdminBody adminToken={app.admin_token} appTitle={app.title} />
      <EditMemberDialog open={openSub === 'edit-member'} onClose={close} />
      <InviteMemberDialog open={openSub === 'invite-member'} onClose={close} />
      <ClearAppDialog open={openSub === 'clear-app'} onClose={close} />
      <DeleteAppDialog open={openSub === 'delete-app'} onClose={close} />
    </DashShell>
  );
}

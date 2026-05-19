import { useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import {
  ActionForm,
  Button,
  Checkbox,
  Content,
  Copyable,
  Dialog,
  Divider,
  Label,
  SectionHeading,
  Select,
  SubsectionHeading,
  TextInput,
} from '@/components/ui';
import {
  DashShell,
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
      className="block cursor-pointer justify-start space-y-2 rounded-sm border bg-white p-4 shadow-xs transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700/50"
    >
      <div>
        <div className="font-bold">{title}</div>
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
  const [hideAdminToken, setHideAdminToken] = useState(true);
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
    <div className="flex h-full max-w-2xl flex-col gap-4 p-4">
      <SectionHeading className="pt-4">Admin SDK</SectionHeading>
      <DocsCard href="/docs/backend" title="Instant and your backend">
        Learn how to use the Admin SDK to integrate Instant with your backend.
      </DocsCard>
      <Content>
        Use the admin token below to authenticate with your backend. Keep this
        token a secret. If need be, you can regenerate it by{' '}
        <a className="hover:cursor-pointer dark:text-white" href="#">
          clicking here
        </a>
        .
      </Content>
      <Copyable
        onChangeHideValue={() => setHideAdminToken(!hideAdminToken)}
        hideValue={hideAdminToken}
        label="Secret"
        value={adminToken}
      />
      <Divider />

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <TextInput
          label="App name"
          placeholder="My awesome app"
          value={appName}
          onChange={setAppName}
        />
        <Button variant="secondary">Update app name</Button>
      </form>

      <div className="flex flex-col gap-1">
        <SectionHeading>Team Members</SectionHeading>
        <SubsectionHeading>Members</SubsectionHeading>
        {members.length ? (
          <div className="flex flex-col gap-1">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex flex-1 justify-between">
                  <div>{member.email}</div>
                  <div className="text-gray-400 dark:text-neutral-400">
                    {member.role[0].toUpperCase() + member.role.slice(1)}
                  </div>
                </div>
                <div className="flex w-28">
                  <Button className="w-full" variant="secondary">
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-400 dark:text-neutral-400">
            No team members
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Button variant="secondary">Invite a team member</Button>
      </div>

      <div>
        <SectionHeading className="pt-4">Transfer App</SectionHeading>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 pt-2">
            <Label className="font-normal opacity-70">
              Destination Organization
            </Label>
            <div className="flex w-full items-center justify-between rounded-xs border border-gray-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-700/40">
              <span>my-new-org</span>
              <span className="text-gray-400">▾</span>
            </div>
          </div>
          <div>
            <Button variant="secondary">Transfer app</Button>
          </div>
        </div>
      </div>

      <div className="mt-auto space-y-2 pb-4">
        <SectionHeading className="pt-4">Danger zone</SectionHeading>
        <Content>
          These are destructive actions and will irreversibly delete associated
          data.
        </Content>
        <div className="flex flex-col space-y-6">
          <Button variant="destructive">
            <TrashIcon height="1rem" /> Clear app
          </Button>
          <Button variant="destructive">
            <TrashIcon height="1rem" /> Delete app
          </Button>
        </div>
      </div>
    </div>
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
        <h5 className="flex items-center text-lg font-bold">
          Edit team member
        </h5>
        <Button variant="primary">Promote to admin</Button>
        <Button className="w-full" variant="destructive">
          Remove from team
        </Button>
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
        <h5 className="flex items-center text-lg font-bold">
          Invite a team member
        </h5>
        <TextInput
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
        />
        <div className="flex flex-col gap-1">
          <Label>Role</Label>
          <Select
            value={role}
            onChange={(o) => o && setRole(o.value as 'admin' | 'collaborator')}
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'collaborator', label: 'Collaborator' },
            ]}
          />
        </div>
        <Button type="submit" variant="primary" disabled={!email}>
          Invite
        </Button>
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
      <div className="flex flex-col gap-2">
        <SubsectionHeading className="text-red-600">
          Clear app
        </SubsectionHeading>
        <Content className="space-y-2">
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
        </Content>
        <Checkbox
          checked={ok}
          onChange={(c) => setOk(c)}
          label="I understand and want to clear this app."
        />
        <Button variant="destructive" disabled={!ok}>
          Clear data
        </Button>
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
      <div className="flex flex-col gap-2">
        <SubsectionHeading className="text-red-600">
          Delete app
        </SubsectionHeading>
        <Content>
          Deleting an app will irreversibly delete all associated data.
        </Content>
        <Checkbox
          checked={ok}
          onChange={(c) => setOk(c)}
          label="I understand and want to delete this app."
        />
        <Button variant="destructive" disabled={!ok}>
          Delete
        </Button>
      </div>
    </Dialog>
  );
}

export function Current({ sub = 'default' }: { sub?: AdminSubState }) {
  const ephemeral = useEphemeralInstantApp();
  const [openSub, setOpenSub] = useState<AdminSubState>(sub);
  // sync external sub → internal open state on prop change
  if (sub !== openSub && sub !== 'default') {
    // pin to the sub the sidebar requested
    setOpenSub(sub);
  }
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

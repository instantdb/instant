import { TrashIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import produce from 'immer';
import { capitalize } from 'lodash';
import { ReactNode, useContext, useState } from 'react';
import { v4 } from 'uuid';

import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch, jsonMutate } from '@/lib/fetch';
import { errorToast, successToast } from '@/lib/toast';
import {
  InstantApp,
  InstantIssue,
  InstantMember,
  OrgSummary,
} from '@/lib/types';

import { useFetchedDash } from '@/components/dash/MainDashLayout';
import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
  Content,
  Copyable,
  Dialog,
  Label,
  SectionHeading,
  Select,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { useForm } from '@/lib/hooks/useForm';
import { HomeButton, isMinRole, Role, TabContent } from '@/pages/dash';
import { Workspace } from '@/lib/hooks/useWorkspace';
import Link from 'next/link';
import { formatCredit } from '../dash/org-management/OrgBilling';
import { messageFromInstantError } from '@/lib/errors';

// A top-level section header: bold title plus an optional one-line muted
// description. This is where the page's hierarchy lives.
function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <SectionHeading>{title}</SectionHeading>
      {description ? (
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          {description}
        </p>
      ) : null}
    </div>
  );
}

// Muted helper text under a field label.
function FieldHint({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-gray-500 dark:text-neutral-400">{children}</p>
  );
}

// Small muted badge for secondary metadata (e.g. an invite's status).
function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs text-gray-500 dark:border-neutral-700 dark:text-neutral-400">
      {children}
    </span>
  );
}

// Bordered, divided list container shared by the member lists.
function RowList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y overflow-hidden rounded-sm border dark:divide-neutral-700 dark:border-neutral-700">
      {children}
    </div>
  );
}

// Centered callout used for the empty / upgrade states.
function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-sm border border-dashed px-6 py-8 text-center dark:border-neutral-700">
      {children}
    </div>
  );
}

// Subtle, text-only row action. Destructive variant goes red on hover.
function RowAction({
  children,
  onClick,
  destructive = false,
}: {
  children: ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        destructive
          ? 'cursor-pointer text-sm text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400'
          : 'cursor-pointer text-sm text-gray-400 hover:text-gray-700 dark:text-neutral-500 dark:hover:text-neutral-200'
      }
    >
      {children}
    </button>
  );
}

function PersonRow({
  email,
  role,
  status,
  action,
}: {
  email: string;
  role?: string;
  status?: { label: string };
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{email}</span>
        {status ? <Pill>{status.label}</Pill> : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {role ? (
          <span className="text-sm text-gray-400 dark:text-neutral-500">
            {capitalize(role)}
          </span>
        ) : null}
        {action}
      </div>
    </div>
  );
}

function DangerRow({
  title,
  description,
  actionLabel,
  onClick,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-gray-500 dark:text-neutral-400">
          {description}
        </span>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        <TrashIcon height={'1rem'} />
        {actionLabel}
      </button>
    </div>
  );
}

export function Admin({
  app,
  onDelete,
  role,
  nav,
  workspace,
}: {
  app: InstantApp;
  onDelete: () => void;
  role: Role;
  nav: (p: { s: string; t?: string; app?: string }) => void;
  workspace: Workspace;
}) {
  const dashResponse = useFetchedDash();
  const token = useContext(TokenContext);
  const [deleteAppOk, updateDeleteAppOk] = useState(false);
  const [isDeletingApp, setIsDeletingApp] = useState(false);
  const [clearAppOk, updateClearAppOk] = useState(false);
  const [isClearingApp, setIsClearingApp] = useState(false);
  const [editMember, setEditMember] = useState<InstantMember | null>();
  const [hideAdminToken, setHideAdminToken] = useState(true);
  const [isRegeneratingToken, setIsRegeneratingToken] = useState(false);
  const clearDialog = useDialog();
  const deleteDialog = useDialog();
  const inviteDialog = useDialog();
  const regenerateDialog = useDialog();

  const isPaidOrg = workspace.type === 'org' && workspace.org.paid;

  const displayedInvites = app.invites?.filter(
    (invite) => invite.status !== 'accepted',
  );

  const canAddMembers = app.pro || isPaidOrg;
  const hasAppPeople =
    Boolean(app.members?.length) || Boolean(displayedInvites?.length);

  async function regenerateToken() {
    const appIndex = dashResponse.data.apps.findIndex((a) => a.id === app.id);
    const newAdminToken = v4();

    setIsRegeneratingToken(true);
    try {
      await regenerateAdminToken(token, app.id, newAdminToken);
    } catch (error) {
      errorToast(
        "Uh oh! We couldn't generate a new admin token. Please ping Joe & Stopa, or try again.",
      );
      return;
    } finally {
      setIsRegeneratingToken(false);
    }

    dashResponse.mutate(
      produce(dashResponse.data, (d) => {
        if (d.apps && appIndex >= 0) {
          d.apps[appIndex].admin_token = newAdminToken;
        }
      }),
    );
    regenerateDialog.onClose();
  }

  async function revokeInvite(inviteId: string) {
    try {
      await dashResponse.optimisticUpdate(
        jsonMutate(`${config.apiURI}/dash/apps/${app.id}/invite/revoke`, {
          method: 'DELETE',
          token,
          body: { 'invite-id': inviteId },
        }),
      );
      dashResponse.refetch();
      successToast('Revoked team member invite.');
    } catch (e) {
      errorToast('An error occurred while revoking the invite.');
    }
  }

  const appNameForm = useForm<{ name: string }>({
    initial: { name: app.title },
    validators: {
      name: (n) =>
        n.trim().length ? undefined : { error: 'Name is required' },
    },
    onSubmit: async (values) => {
      const name = values.name.trim();
      if (dashResponse.data.workspace.type === 'personal') {
        // personal app
        await dashResponse.optimisticUpdate(
          jsonMutate(`${config.apiURI}/dash/apps/${app.id}/rename`, {
            method: 'POST',
            token,
            body: {
              title: name,
            },
          }),
          (d) => {
            const _app = d?.apps?.find((a) => a.id === app.id);
            if (!_app) return;

            _app.title = name;
          },
        );
      } else {
        // org
        dashResponse.optimisticUpdateWorkspace(
          jsonMutate(`${config.apiURI}/dash/apps/${app.id}/rename`, {
            method: 'POST',
            token,
            body: {
              title: name,
            },
          }),
          (d) => {
            const _app = d?.apps?.find((a) => a.id === app.id);
            if (!_app) return;

            _app.title = name;
          },
        );
      }

      successToast('App name updated!');
    },
  });

  return (
    <TabContent className="mx-auto h-full w-full gap-6">
      {/* Reserved top slot so content lines up with the auth/webhooks pages. */}
      <div className="flex h-5 items-center" />
      <div className="flex flex-col gap-8">
        {/* App settings: name + admin token */}
        <div className="flex flex-col gap-4">
          <SectionHeader title="App settings" />

          {isMinRole('owner', role) ? (
            <div className="flex flex-col gap-2">
              <Label>App name</Label>
              <form
                className="flex items-start gap-2"
                {...appNameForm.formProps()}
              >
                <div className="flex-1">
                  <TextInput
                    {...appNameForm.inputProps('name')}
                    placeholder="My awesome app"
                  />
                </div>
                <Button
                  variant="secondary"
                  {...appNameForm.submitButtonProps()}
                >
                  Update
                </Button>
              </form>
            </div>
          ) : null}

          <Content>
            Use the admin token below to authenticate with your backend. Keep
            this token a secret.{' '}
            {isMinRole('admin', role) ? (
              <>
                If need be, you can regenerate it by{' '}
                <a
                  className="hover:cursor-pointer dark:text-white"
                  onClick={regenerateDialog.onOpen}
                >
                  clicking here
                </a>
                .
              </>
            ) : null}
          </Content>
          <Copyable
            onChangeHideValue={() => setHideAdminToken(!hideAdminToken)}
            hideValue={hideAdminToken}
            label="Admin token"
            value={app.admin_token}
          />
          <HomeButton href="/docs/backend" title="Instant and your backend" target="_blank">
            Learn how to use the Admin SDK to integrate Instant with your
            backend.
          </HomeButton>
        </div>

        {/* Team */}
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="Team"
            description="Manage who can access this app."
          />

          {workspace.type === 'org' && (
            <div className="flex flex-col gap-2">
              <Label>Organization members</Label>
              <RowList>
                {workspace.members.map((member) => (
                  <PersonRow
                    key={member.id}
                    email={member.email}
                    role={member.role}
                  />
                ))}
              </RowList>
              <FieldHint>
                Modify organization members from your{' '}
                <Link
                  className="underline"
                  href={`/dash/org?org=${workspace.org.id}`}
                >
                  organization settings
                </Link>
                .
              </FieldHint>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {workspace.type === 'org' ? <Label>App-only members</Label> : null}

            {hasAppPeople ? (
              <RowList>
                {app.members?.map((member) => (
                  <PersonRow
                    key={member.id}
                    email={member.email}
                    role={member.role}
                    action={
                      <RowAction onClick={() => setEditMember(member)}>
                        Edit
                      </RowAction>
                    }
                  />
                ))}
                {displayedInvites?.map((invite) => (
                  <PersonRow
                    key={invite.id}
                    email={invite.email}
                    role={invite.role}
                    status={{
                      label: invite.expired
                        ? 'Expired'
                        : capitalize(invite.status),
                    }}
                    action={
                      !invite.expired && invite.status === 'pending' ? (
                        <RowAction
                          destructive
                          onClick={() => revokeInvite(invite.id)}
                        >
                          Revoke
                        </RowAction>
                      ) : null
                    }
                  />
                ))}
                {canAddMembers ? (
                  <button
                    type="button"
                    onClick={inviteDialog.onOpen}
                    className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    <PlusIcon height={14} /> Invite a team member
                    {isPaidOrg ? ' to this app only' : ''}
                  </button>
                ) : null}
              </RowList>
            ) : canAddMembers ? (
              <Callout>
                <FieldHint>
                  Invite teammates to collaborate on this app.
                </FieldHint>
                <Button variant="primary" onClick={inviteDialog.onOpen}>
                  <PlusIcon height={14} /> Invite a team member
                </Button>
              </Callout>
            ) : null}

            {!canAddMembers ? (
              <Callout>
                <FieldHint>
                  Upgrade to a paid plan to invite teammates to this app.
                </FieldHint>
                <div className="flex flex-col items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={() =>
                      nav({ s: 'main', app: app.id, t: 'billing' })
                    }
                  >
                    Upgrade to Pro
                  </Button>
                  {workspace.type === 'org' ? (
                    <Button
                      type="link"
                      variant="subtle"
                      href={`/dash/org?org=${workspace.org.id}&tab=billing`}
                    >
                      Or upgrade the org to the startup plan
                    </Button>
                  ) : null}
                </div>
              </Callout>
            ) : null}
          </div>
        </div>

        {isMinRole(app.org ? 'admin' : 'owner', role) && (
          <TransferApp app={app} />
        )}

        {isMinRole(app.org ? 'admin' : 'owner', role) ? (
          <div className="flex flex-col gap-3 pb-4">
            <SectionHeader
              title="Danger zone"
              description="These actions are irreversible and permanently delete data."
            />
            <div className="overflow-hidden rounded-sm border border-dashed border-red-200 dark:border-red-900/50">
              {isMinRole('owner', role) && (
                <DangerRow
                  title="Clear app"
                  description="Delete all namespaces, triples, and permissions. Keeps the app, token, and members."
                  actionLabel="Clear app"
                  onClick={clearDialog.onOpen}
                />
              )}
              <DangerRow
                title="Delete app"
                description="Permanently delete this app and all of its data."
                actionLabel="Delete app"
                onClick={deleteDialog.onOpen}
              />
            </div>
          </div>
        ) : null}
      </div>

      <Dialog
        title="Invite Members"
        open={inviteDialog.open}
        onClose={inviteDialog.onClose}
      >
        <InviteTeamMemberDialog app={app} onClose={inviteDialog.onClose} />
      </Dialog>
      <Dialog
        title="Edit Member"
        open={Boolean(editMember)}
        onClose={() => setEditMember(null)}
      >
        {editMember ? (
          <div className="flex flex-col gap-4">
            <h5 className="flex items-center text-lg font-bold">
              Edit team member
            </h5>
            <ActionButton
              label={
                editMember.role === 'admin'
                  ? 'Change to collaborator'
                  : 'Promote to admin'
              }
              submitLabel="Updating role..."
              successMessage="Update team member role."
              errorMessage="An error occurred while attempting to update team member."
              onClick={async () => {
                await jsonMutate(
                  `${config.apiURI}/dash/apps/${app.id}/members/update`,
                  {
                    token,
                    body: {
                      id: editMember.id,
                      role:
                        editMember.role === 'admin' ? 'collaborator' : 'admin',
                    },
                  },
                );

                await dashResponse.mutate();

                setEditMember(null);
              }}
            />
            <ActionButton
              className="w-full"
              variant="destructive"
              label="Remove from team"
              submitLabel="Removing..."
              successMessage="Removed team member."
              errorMessage="An error occurred while attempting to remove team member."
              onClick={async () => {
                await jsonMutate(
                  `${config.apiURI}/dash/apps/${app.id}/members/remove`,
                  {
                    method: 'DELETE',
                    token,
                    body: {
                      id: editMember.id,
                    },
                  },
                );

                await dashResponse.mutate();

                setEditMember(null);
              }}
            />
          </div>
        ) : null}
      </Dialog>
      <Dialog title="Regenerate token" {...regenerateDialog}>
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Regenerate admin token</SubsectionHeading>
          <Content>
            This will invalidate your current token. Any backend using it will
            stop working until you update it with the new token.
          </Content>
          <Button
            loading={isRegeneratingToken}
            variant="destructive"
            onClick={regenerateToken}
          >
            Regenerate token
          </Button>
        </div>
      </Dialog>
      <Dialog title="Clear App" {...clearDialog}>
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
            checked={clearAppOk}
            onChange={(c) => updateClearAppOk(c)}
            label="I understand and want to clear this app."
          />
          <Button
            disabled={!clearAppOk || isClearingApp}
            variant="destructive"
            onClick={async () => {
              setIsClearingApp(true);
              try {
                await jsonFetch(`${config.apiURI}/dash/apps/${app.id}/clear`, {
                  method: 'POST',
                  headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                  },
                });
                clearDialog.onClose();
                dashResponse.mutate();
                successToast('App cleared!');
              } catch {
                errorToast('Failed to clear the app.');
              } finally {
                setIsClearingApp(false);
              }
            }}
          >
            {isClearingApp ? 'Clearing data...' : 'Clear data'}
          </Button>
        </div>
      </Dialog>
      <Dialog title="Delete App" {...deleteDialog}>
        <div className="flex flex-col gap-2">
          <SubsectionHeading className="text-red-600">
            Delete app
          </SubsectionHeading>
          <Content>
            Deleting an app will irreversibly delete all associated data.
          </Content>
          <Checkbox
            checked={deleteAppOk}
            onChange={(c) => updateDeleteAppOk(c)}
            label="I understand and want to delete this app."
          />
          <Button
            disabled={!deleteAppOk || isDeletingApp}
            variant="destructive"
            onClick={async () => {
              setIsDeletingApp(true);
              try {
                await jsonFetch(`${config.apiURI}/dash/apps/${app.id}`, {
                  method: 'DELETE',
                  headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                  },
                });
                onDelete();
              } catch {
                errorToast('Failed to delete the app.');
                setIsDeletingApp(false);
              }
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </TabContent>
  );
}

function regenerateAdminToken(
  token: string,
  appId: string,
  adminToken: string,
) {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/tokens`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ 'admin-token': adminToken }),
  });
}

function InviteTeamMemberDialog({
  onClose,
  app,
}: {
  onClose: () => void;
  app: InstantApp;
}) {
  const dashResponse = useFetchedDash();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'collaborator'>('collaborator');
  const token = useContext(TokenContext);

  function onSubmit() {
    onClose();

    return dashResponse.optimisticUpdate(
      jsonMutate(`${config.apiURI}/dash/apps/${app.id}/invite/send`, {
        token,
        body: {
          'invitee-email': email,
          role,
        },
      }),
      (d) => {
        const _app = d?.apps?.find((a) => a.id === app.id);
        if (!_app) return;

        const _invite = _app.invites?.find((i) => i.email === email);

        if (_invite) {
          _invite.status = 'pending';
          _invite.role = role;
        } else {
          _app.invites?.push({
            id: v4(),
            email,
            role,
            status: 'pending',
            expired: false,
            sent_at: new Date().toISOString(),
          });
        }
      },
    );
  }

  return (
    <ActionForm className="flex flex-col gap-4">
      <h5 className="flex items-center text-lg font-bold">
        Invite a team member
      </h5>

      <TextInput
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e)}
      />

      <div className="flex flex-col gap-1">
        <Label>Role</Label>
        <Select
          value={role}
          onChange={(o) => {
            if (!o) return;
            setRole(o.value as 'admin' | 'collaborator');
          }}
          options={[
            { value: 'admin', label: 'Admin' },
            { value: 'collaborator', label: 'Collaborator' },
          ]}
        />
      </div>

      <ActionButton
        type="submit"
        label="Invite"
        submitLabel="Inviting..."
        successMessage="Invite sent!"
        errorMessage="Failed to send invite."
        disabled={!email}
        onClick={onSubmit}
      />
    </ActionForm>
  );
}

const TransferApp = ({ app }: { app: InstantApp }) => {
  const dash = useFetchedDash();
  const orgs =
    dash.data.orgs?.filter((org) => org.id !== dash.data.currentWorkspaceId) ||
    [];
  const [org, setOrg] = useState<OrgSummary | undefined>(orgs[0]);
  const [isLoading, setIsLoading] = useState(false);
  const confirmationModal = useDialog();
  const token = useContext(TokenContext);

  async function transfer(
    { app, org }: { app: InstantApp; org: OrgSummary },
    token: string,
  ) {
    try {
      setIsLoading(true);
      const resp = await jsonFetch(
        `${config.apiURI}/dash/apps/${app.id}/transfer_to_org/${org.id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );
      successToast(`${app.title} was transferred to ${org.title}.`);
      if (resp.credit < 0) {
        successToast(
          `${org.title} received a ${formatCredit(resp.credit)} credit for the app's unused balance.`,
          { autoClose: 10000 },
        );
      }
      dash.setWorkspace(org.id);
      dash.mutate();
      confirmationModal.onClose();
    } catch (e) {
      errorToast(
        `Error transferring app. ${messageFromInstantError(e as InstantIssue)}`,
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {org ? (
        <Dialog
          title="Transfer App"
          hideCloseButton
          className="pt-5"
          {...confirmationModal}
        >
          <div className="-translate-y-1 text-[15px]">
            Are you sure you want to transfer <strong>{app.title}</strong> to{' '}
            <strong>{org.title}</strong>?
          </div>
          {org.paid && app.pro ? (
            <Content className="pt-4">
              <strong>{org.title}</strong> is a paid organization. After you
              transfer the app, you will get a credit on the org for any
              remaining balance on the app's plan.
            </Content>
          ) : null}
          <div className="flex w-full items-end justify-end gap-2 pt-4">
            <Button
              variant="subtle"
              onClick={() => {
                confirmationModal.onClose();
              }}
            >
              Cancel
            </Button>
            <Button
              loading={isLoading}
              onClick={() => {
                transfer({ app, org }, token);
              }}
            >
              Transfer{isLoading ? 'ing...' : ''}
            </Button>
          </div>
        </Dialog>
      ) : null}
      <SectionHeader
        title="Transfer app"
        description="Move this app to one of your organizations."
      />
      {orgs.length === 0 ? (
        <FieldHint>No organizations to transfer to.</FieldHint>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Select<string>
              className="w-full focus-visible:border-gray-300 focus-visible:ring-0 dark:focus-visible:border-neutral-700"
              value={org?.id}
              onChange={(option) => {
                if (!option) return;
                const org = orgs.find((o) => o.id === option.value);
                if (!org) return;
                setOrg(org);
              }}
              options={orgs.map((o) => ({ value: o.id, label: o.title }))}
            ></Select>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              confirmationModal.onOpen();
            }}
          >
            Transfer
          </Button>
        </div>
      )}
    </div>
  );
};

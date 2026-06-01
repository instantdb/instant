import {
  ArrowsRightLeftIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/solid';
import type { ComponentType, SVGProps } from 'react';
import produce from 'immer';
import { capitalize } from 'lodash';
import { ReactNode, useContext, useEffect, useState } from 'react';
import { encode } from 'querystring';
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
import { HomeButton, isMinRole, Role } from '@/pages/dash';
import { Workspace } from '@/lib/hooks/useWorkspace';
import { useReadyRouter } from '@/components/clientOnlyPage';
import Link from 'next/link';
import { formatCredit } from '../dash/org-management/OrgBilling';
import { messageFromInstantError } from '@/lib/errors';

type Invite = NonNullable<InstantApp['invites']>[number];
type Router = ReturnType<typeof useReadyRouter>;

const ADMIN_VIEW_PARAM = 'adminView';

// Keep the rest of the dashboard params (app, org, t) intact and only toggle the
// admin drill-in param, so detail views are deeplinkable and back returns home.
function adminHref(router: Router, view?: string) {
  const params = new URLSearchParams(encode(router.query));
  params.delete(ADMIN_VIEW_PARAM);
  if (view) {
    params.set(ADMIN_VIEW_PARAM, view);
  }
  return `${router.pathname}?${params.toString()}`;
}

function AdminBackLink() {
  const router = useReadyRouter();
  return (
    <Link
      href={adminHref(router)}
      className="flex items-center gap-1 self-start text-sm text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-white"
    >
      <ChevronLeftIcon height={14} /> Back to admin
    </Link>
  );
}

// Shared shell for every admin view. The top slot is always the same height, so
// content sits at the same vertical position whether or not a back link shows.
function AdminLayout({
  showBack,
  children,
}: {
  showBack: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      <div className="flex h-5 items-center">
        {showBack ? <AdminBackLink /> : null}
      </div>
      {children}
    </div>
  );
}

function AdminDetailLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <AdminLayout showBack>
      <div className="flex flex-col gap-1">
        <SectionHeading>{title}</SectionHeading>
        {description ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </AdminLayout>
  );
}

// A navigable row on the landing page: icon, title, one-line description, chevron.
function NavRow({
  href,
  title,
  description,
  icon: Icon,
  iconClassName = 'text-gray-400 dark:text-neutral-500',
}: {
  href: string;
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  iconClassName?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-neutral-800"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Icon className={`h-5 w-5 shrink-0 ${iconClassName}`} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">{title}</span>
          <span className="truncate text-sm text-gray-500 dark:text-neutral-400">
            {description}
          </span>
        </div>
      </div>
      <ChevronRightIcon
        height={18}
        className="text-gray-300 dark:text-neutral-600"
      />
    </Link>
  );
}

const rowActionClass =
  'cursor-pointer text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-200';

function RowList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y overflow-hidden rounded-sm border dark:divide-neutral-700 dark:border-neutral-700">
      {children}
    </div>
  );
}

function PersonRow({
  email,
  role,
  action,
}: {
  email: string;
  role: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="truncate text-sm">{email}</span>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm text-gray-400 dark:text-neutral-500">
          {capitalize(role)}
        </span>
        {action}
      </div>
    </div>
  );
}

function RevokeInviteButton({
  app,
  invite,
}: {
  app: InstantApp;
  invite: Invite;
}) {
  const dashResponse = useFetchedDash();
  const token = useContext(TokenContext);
  const [isRevoking, setIsRevoking] = useState(false);

  return (
    <button
      type="button"
      disabled={isRevoking}
      className="cursor-pointer text-sm text-gray-400 hover:text-red-500 disabled:opacity-50 dark:text-neutral-500 dark:hover:text-red-400"
      onClick={async () => {
        setIsRevoking(true);
        try {
          await dashResponse.optimisticUpdate(
            jsonMutate(`${config.apiURI}/dash/apps/${app.id}/invite/revoke`, {
              method: 'DELETE',
              token,
              body: { 'invite-id': invite.id },
            }),
          );
          dashResponse.refetch();
        } catch {
          errorToast('Failed to revoke invite.');
        } finally {
          setIsRevoking(false);
        }
      }}
    >
      {isRevoking ? 'Revoking…' : 'Revoke'}
    </button>
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
  const router = useReadyRouter();
  const dashResponse = useFetchedDash();
  const token = useContext(TokenContext);
  const [deleteAppOk, updateDeleteAppOk] = useState(false);
  const [isDeletingApp, setIsDeletingApp] = useState(false);
  const [clearAppOk, updateClearAppOk] = useState(false);
  const [isClearingApp, setIsClearingApp] = useState(false);
  const [editMember, setEditMember] = useState<InstantMember | null>();
  const [hideAdminToken, setHideAdminToken] = useState(true);
  const regenerateDialog = useDialog();
  const clearDialog = useDialog();
  const deleteDialog = useDialog();
  const inviteDialog = useDialog();

  const adminView =
    typeof router.query[ADMIN_VIEW_PARAM] === 'string'
      ? (router.query[ADMIN_VIEW_PARAM] as string)
      : null;

  // Query-param navigation keeps scroll position, so reset to the top whenever
  // we move between the landing and a drill-in view.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [adminView]);

  const isPaidOrg = workspace.type === 'org' && workspace.org.paid;
  const canRename = isMinRole('owner', role);
  const canManageLifecycle = isMinRole(app.org ? 'admin' : 'owner', role);
  const canAddMembers = app.pro || isPaidOrg;

  const displayedInvites = app.invites?.filter(
    (invite) => invite.status !== 'accepted',
  );

  async function regenerateToken() {
    const appIndex = dashResponse.data.apps.findIndex((a) => a.id === app.id);
    const newAdminToken = v4();

    try {
      await regenerateAdminToken(token, app.id, newAdminToken);
    } catch {
      errorToast("Couldn't generate a new admin token. Please try again.");
      return;
    }

    dashResponse.mutate(
      produce(dashResponse.data, (d) => {
        if (d.apps && appIndex >= 0)
          d.apps[appIndex].admin_token = newAdminToken;
      }),
    );
    regenerateDialog.onClose();
    successToast('Generated a new admin token.');
  }

  const appNameForm = useForm<{ name: string }>({
    initial: { name: app.title },
    validators: {
      name: (n) => (n.length ? undefined : { error: 'Name is required' }),
    },
    onSubmit: async (values) => {
      if (dashResponse.data.workspace.type === 'personal') {
        await dashResponse.optimisticUpdate(
          jsonMutate(`${config.apiURI}/dash/apps/${app.id}/rename`, {
            method: 'POST',
            token,
            body: { title: values.name },
          }),
          (d) => {
            const _app = d?.apps?.find((a) => a.id === app.id);
            if (!_app) return;
            _app.title = values.name;
          },
        );
      } else {
        dashResponse.optimisticUpdateWorkspace(
          jsonMutate(`${config.apiURI}/dash/apps/${app.id}/rename`, {
            method: 'POST',
            token,
            body: { title: values.name },
          }),
          (d) => {
            const _app = d?.apps?.find((a) => a.id === app.id);
            if (!_app) return;
            _app.title = values.name;
          },
        );
      }

      successToast('App name updated!');
    },
  });

  // Team members
  if (adminView === 'team') {
    return (
      <AdminDetailLayout
        title="Team members"
        description="Manage who can access this app."
      >
        {workspace.type === 'org' && (
          <div className="flex flex-col gap-2">
            <SubsectionHeading>Organization members</SubsectionHeading>
            <RowList>
              {workspace.members.map((member) => (
                <PersonRow
                  key={member.id}
                  email={member.email}
                  role={member.role}
                />
              ))}
            </RowList>
            <Content className="text-sm dark:text-neutral-300">
              Modify organization members from the{' '}
              <Link
                className="dark:text-white"
                href={`/dash/org?org=${workspace.org.id}`}
              >
                Organization settings
              </Link>
              .
            </Content>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {workspace.type === 'org' ? (
            <SubsectionHeading>App-only members</SubsectionHeading>
          ) : null}
          {app.members?.length ? (
            <RowList>
              {app.members.map((member) => (
                <PersonRow
                  key={member.id}
                  email={member.email}
                  role={member.role}
                  action={
                    <button
                      type="button"
                      className={rowActionClass}
                      onClick={() => setEditMember(member)}
                    >
                      Edit
                    </button>
                  }
                />
              ))}
            </RowList>
          ) : (
            <div className="rounded-sm border border-dashed px-4 py-6 text-center text-sm text-gray-400 dark:border-neutral-700 dark:text-neutral-500">
              No team members yet.
            </div>
          )}
        </div>

        {displayedInvites?.length ? (
          <div className="flex flex-col gap-2">
            <SubsectionHeading>Pending invites</SubsectionHeading>
            <RowList>
              {displayedInvites.map((invite) => (
                <PersonRow
                  key={invite.id}
                  email={invite.email}
                  role={invite.role}
                  action={
                    !invite.expired && invite.status === 'pending' ? (
                      <RevokeInviteButton app={app} invite={invite} />
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-neutral-500">
                        {invite.expired ? 'Expired' : capitalize(invite.status)}
                      </span>
                    )
                  }
                />
              ))}
            </RowList>
          </div>
        ) : null}

        {canAddMembers ? (
          <Button variant="primary" onClick={inviteDialog.onOpen}>
            Invite a team member{isPaidOrg ? ' to this app only' : ''}
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-sm border bg-gray-100 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800">
              <InformationCircleIcon width={18} />
              Upgrade to a paid app to manage members.{' '}
              <Link className="underline" href="/pricing">
                View pricing.
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {workspace.type === 'org' ? (
                <Button
                  type="link"
                  variant="secondary"
                  href={`/dash/org?org=${workspace.org.id}&tab=billing`}
                >
                  Upgrade the org to the startup plan
                </Button>
              ) : null}
              <Button
                variant="secondary"
                onClick={() => {
                  nav({ s: 'main', app: app.id, t: 'billing' });
                }}
              >
                Upgrade the app to Pro
              </Button>
            </div>
          </div>
        )}

        <Dialog
          title="Invite members"
          open={inviteDialog.open}
          onClose={inviteDialog.onClose}
        >
          <InviteTeamMemberDialog app={app} onClose={inviteDialog.onClose} />
        </Dialog>

        <Dialog
          title="Edit member"
          open={Boolean(editMember)}
          onClose={() => setEditMember(null)}
        >
          {editMember ? (
            <div className="flex flex-col gap-4">
              <SubsectionHeading>{editMember.email}</SubsectionHeading>
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
                          editMember.role === 'admin'
                            ? 'collaborator'
                            : 'admin',
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
                      body: { id: editMember.id },
                    },
                  );

                  await dashResponse.mutate();
                  setEditMember(null);
                }}
              />
            </div>
          ) : null}
        </Dialog>
      </AdminDetailLayout>
    );
  }

  // Transfer app
  if (adminView === 'transfer' && canManageLifecycle) {
    return (
      <AdminDetailLayout
        title="Transfer app"
        description="Move this app to another organization you belong to."
      >
        <TransferApp app={app} />
      </AdminDetailLayout>
    );
  }

  // Danger zone
  if (adminView === 'danger' && canManageLifecycle) {
    return (
      <AdminDetailLayout
        title="Danger zone"
        description="These actions are irreversible and permanently delete data."
      >
        <div className="flex flex-col gap-4 rounded-sm border border-red-200 p-4 dark:border-red-900/40">
          {isMinRole('owner', role) && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">Clear app</div>
                <div className="text-gray-500 dark:text-neutral-400">
                  Delete all namespaces, triples, and permissions.
                </div>
              </div>
              <Button variant="destructive" onClick={clearDialog.onOpen}>
                Clear app
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">Delete app</div>
              <div className="text-gray-500 dark:text-neutral-400">
                Permanently delete this app and all of its data.
              </div>
            </div>
            <Button variant="destructive" onClick={deleteDialog.onOpen}>
              Delete app
            </Button>
          </div>
        </div>

        <Dialog title="Clear app" {...clearDialog}>
          <div className="flex flex-col gap-2">
            <SubsectionHeading>Clear {app.title}</SubsectionHeading>
            <Content className="space-y-2">
              <p>
                Clearing an app will irreversibly delete all namespaces,
                triples, and permissions.
              </p>
              <p>
                All other data like app id, admin token, users, billing, team
                members, etc. will remain.
              </p>
              <p>
                This is equivalent to deleting all your namespaces in the
                explorer and clearing your permissions.
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
                await jsonFetch(`${config.apiURI}/dash/apps/${app.id}/clear`, {
                  method: 'POST',
                  headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                  },
                });

                setIsClearingApp(false);
                clearDialog.onClose();
                dashResponse.mutate();
                successToast('App cleared!');
              }}
            >
              {isClearingApp ? 'Clearing data...' : 'Clear data'}
            </Button>
          </div>
        </Dialog>

        <Dialog title="Delete app" {...deleteDialog}>
          <div className="flex flex-col gap-2">
            <SubsectionHeading>Delete {app.title}</SubsectionHeading>
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
                await jsonFetch(`${config.apiURI}/dash/apps/${app.id}`, {
                  method: 'DELETE',
                  headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                  },
                });
                setIsDeletingApp(false);
                onDelete();
              }}
            >
              Delete
            </Button>
          </div>
        </Dialog>
      </AdminDetailLayout>
    );
  }

  // Landing
  return (
    <AdminLayout showBack={false}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading>App</SectionHeading>
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            Your app's name, admin token, and backend setup.
          </p>
        </div>

        {canRename ? (
          <form className="flex flex-col gap-2" {...appNameForm.formProps()}>
            <TextInput
              {...appNameForm.inputProps('name')}
              label="App name"
              placeholder="My awesome app"
            />
            <Button variant="secondary" {...appNameForm.submitButtonProps()}>
              Update app name
            </Button>
          </form>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <Label>Admin token</Label>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              Authenticate requests from your backend. Keep it secret.
            </p>
          </div>
          <Copyable
            onChangeHideValue={() => setHideAdminToken(!hideAdminToken)}
            hideValue={hideAdminToken}
            label="Secret"
            value={app.admin_token}
          />
          {isMinRole('admin', role) ? (
            <button
              type="button"
              onClick={regenerateDialog.onOpen}
              className={`self-start ${rowActionClass}`}
            >
              Regenerate token
            </button>
          ) : null}
        </div>

        <HomeButton href="/docs/backend" title="Admin SDK">
          Learn how to use the Admin SDK to integrate Instant with your backend.
        </HomeButton>
      </div>

      <RowList>
        <NavRow
          href={adminHref(router, 'team')}
          icon={UsersIcon}
          title="Team members"
          description="Invite and manage who can access this app"
        />
        {canManageLifecycle ? (
          <NavRow
            href={adminHref(router, 'transfer')}
            icon={ArrowsRightLeftIcon}
            title="Transfer app"
            description="Move this app to another organization"
          />
        ) : null}
        {canManageLifecycle ? (
          <NavRow
            href={adminHref(router, 'danger')}
            icon={ExclamationTriangleIcon}
            iconClassName="text-red-400 dark:text-red-400"
            title="Danger zone"
            description="Clear or delete this app"
          />
        ) : null}
      </RowList>

      <Dialog title="Regenerate admin token" {...regenerateDialog}>
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Regenerate admin token</SubsectionHeading>
          <Content>
            This will invalidate your current token. Any backend using it will
            stop working until you swap in the new token.
          </Content>
          <Button variant="destructive" onClick={regenerateToken}>
            Regenerate token
          </Button>
        </div>
      </Dialog>
    </AdminLayout>
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
      <SubsectionHeading>Invite a team member</SubsectionHeading>
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

  if (orgs.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-neutral-400">
        No organizations to transfer to.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
      <div className="flex flex-col gap-1">
        <Label className="font-normal opacity-70">
          Destination Organization
        </Label>
        <Select<string>
          value={org?.id}
          onChange={(option) => {
            if (!option) return;
            const next = orgs.find((o) => o.id === option.value);
            if (!next) return;
            setOrg(next);
          }}
          options={orgs.map((o) => ({ value: o.id, label: o.title }))}
        ></Select>
      </div>
      <Button
        variant="primary"
        onClick={() => {
          confirmationModal.onOpen();
        }}
      >
        Transfer
      </Button>
    </div>
  );
};

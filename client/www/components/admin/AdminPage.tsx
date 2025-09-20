import { InformationCircleIcon, TrashIcon } from '@heroicons/react/24/outline';
import produce from 'immer';
import { capitalize } from 'lodash';
import { useContext, useState } from 'react';
import { v4 } from 'uuid';

import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch, jsonMutate } from '@/lib/fetch';
import { errorToast, successToast } from '@/lib/toast';
import { InstantApp, InstantMember } from '@/lib/types';

import { useFetchedDash } from '@/components/dash/MainDashLayout';
import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
  Content,
  Copyable,
  Dialog,
  Divider,
  InfoTip,
  Label,
  SectionHeading,
  Select,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { useForm } from '@/lib/hooks/useForm';
import { HomeButton, isMinRole, Role, TabContent } from '@/pages/dash';
import { useOrgPaid } from '@/lib/hooks/useOrgPaid';

export function Admin({
  app,
  onDelete,
  role,
  nav,
}: {
  app: InstantApp;
  onDelete: () => void;
  role: Role;
  nav: (p: { s: string; t?: string; app?: string }) => void;
}) {
  const dashResponse = useFetchedDash();
  const token = useContext(TokenContext);
  const [deleteAppOk, updateDeleteAppOk] = useState(false);
  const [isDeletingApp, setIsDeletingApp] = useState(false);
  const [clearAppOk, updateClearAppOk] = useState(false);
  const [isClearingApp, setIsClearingApp] = useState(false);
  const [editMember, setEditMember] = useState<InstantMember | null>();
  const [hideAdminToken, setHideAdminToken] = useState(true);
  const clearDialog = useDialog();
  const deleteDialog = useDialog();
  const inviteDialog = useDialog();

  const isPaidOrg = useOrgPaid();

  const displayedInvites = app.invites?.filter(
    (invite) => invite.status !== 'accepted',
  );

  async function onClickReset() {
    const appIndex = dashResponse.data.apps.findIndex((a) => a.id === app.id);
    const newAdminToken = v4();
    const confirmation =
      'Are you sure? This will invalidate your previous token.';

    if (!confirm(confirmation)) return;

    try {
      await regenerateAdminToken(token, app.id, newAdminToken);
    } catch (error) {
      errorToast(
        "Uh oh! We couldn't generate a new admin token. Please ping Joe & Stopa, or try again.",
      );

      return;
    }

    dashResponse.mutate(
      produce(dashResponse.data, (d) => {
        if (d.apps && appIndex) d.apps[appIndex].admin_token = newAdminToken;
      }),
    );
  }

  const appNameForm = useForm<{ name: string }>({
    initial: { name: app.title },
    validators: {
      name: (n) => (n.length ? undefined : { error: 'Name is required' }),
    },
    onSubmit: async (values) => {
      if (dashResponse.data.workspace.type === 'personal') {
        // personal app
        await dashResponse.optimisticUpdate(
          jsonMutate(`${config.apiURI}/dash/apps/${app.id}/rename`, {
            method: 'POST',
            token,
            body: {
              title: values.name,
            },
          }),
          (d) => {
            const _app = d?.apps?.find((a) => a.id === app.id);
            if (!_app) return;

            _app.title = values.name;
          },
        );
      } else {
        // org
        dashResponse.optimisticUpdateWorkspace(
          jsonMutate(`${config.apiURI}/dash/apps/${app.id}/rename`, {
            method: 'POST',
            token,
            body: {
              title: values.name,
            },
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

  return (
    <TabContent className="h-full">
      <SectionHeading className="pt-4">Admin SDK</SectionHeading>
      <HomeButton href="/docs/backend" title="Instant and your backend">
        Learn how to use the Admin SDK to integrate Instant with your backend.
      </HomeButton>
      <Content>
        Use the admin token below to authenticate with your backend. Keep this
        token a secret.{' '}
        {isMinRole('admin', role) ? (
          <>
            If need be, you can regenerate it by{' '}
            <a onClick={onClickReset}>clicking here</a>.
          </>
        ) : null}
      </Content>
      <Copyable
        onChangeHideValue={() => setHideAdminToken(!hideAdminToken)}
        hideValue={hideAdminToken}
        label="Secret"
        value={app.admin_token}
      />
      <Divider />
      <Dialog open={inviteDialog.open} onClose={inviteDialog.onClose}>
        <InviteTeamMemberDialog app={app} onClose={inviteDialog.onClose} />
      </Dialog>
      <Dialog open={Boolean(editMember)} onClose={() => setEditMember(null)}>
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
      {isMinRole('owner', role) ? (
        <form className="flex flex-col gap-2" {...appNameForm.formProps()}>
          <TextInput
            {...appNameForm.inputProps('name')}
            label="App name"
            placeholder="My awesome app"
          />
          <Button {...appNameForm.submitButtonProps()}>Update app name</Button>
        </form>
      ) : null}
      {app.pro || isPaidOrg ? (
        <>
          <div className="flex flex-col gap-1">
            <SectionHeading>Team Members</SectionHeading>
            {app.members?.length ? (
              <div className="flex flex-col gap-1">
                {app.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex justify-between items-center gap-3"
                  >
                    <div className="flex justify-between flex-1">
                      <div>{member.email}</div>
                      <div className="text-gray-400">
                        {capitalize(member.role)}
                      </div>
                    </div>
                    <div className="w-28 flex">
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={() => setEditMember(member)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-400">No team members</div>
            )}
          </div>
          {displayedInvites?.length ? (
            <div className="flex flex-col">
              <SubsectionHeading>Invites</SubsectionHeading>
              <div className="flex flex-col gap-0.5">
                {displayedInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex justify-between items-center gap-3"
                  >
                    <div className="flex flex-1 justify-between gap-2 overflow-hidden">
                      <div className="truncate">{invite.email}</div>
                      <div className="text-gray-400">
                        {capitalize(invite.role)}
                      </div>
                    </div>
                    <div className="w-28 flex">
                      {!invite.expired && invite.status === 'pending' ? (
                        <ActionButton
                          className="w-full"
                          label="Revoke"
                          submitLabel="Revoking..."
                          successMessage="Revoked team member invite."
                          errorMessage="An error occurred while attempting to revoke team member invite."
                          onClick={async () => {
                            dashResponse.optimisticUpdate(
                              jsonMutate(
                                `${config.apiURI}/dash/apps/${app.id}/invite/revoke`,
                                {
                                  method: 'DELETE',
                                  token,
                                  body: {
                                    'invite-id': invite.id,
                                  },
                                },
                              ),
                            );
                            dashResponse.refetch();
                          }}
                        />
                      ) : (
                        <Button className="w-full" variant="secondary" disabled>
                          {invite.expired
                            ? 'Expired'
                            : capitalize(invite.status)}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            {app.pro || isPaidOrg ? (
              <Button
                onClick={() => {
                  inviteDialog.onOpen();
                }}
              >
                Invite a team member
              </Button>
            ) : (
              <>
                <Content className="italic">
                  Team member management is a Pro feature.
                </Content>
                <Button
                  onClick={() => {
                    nav({ s: 'main', app: app.id, t: 'billing' });
                  }}
                >
                  Upgrade to Pro
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="bg-gray-100 flex gap-2 items-center p-2 rounded border">
          <InformationCircleIcon width={18}></InformationCircleIcon>
          Upgrade to a paid app to manage members.
        </div>
      )}

      <TransferApp app={app} />

      {isMinRole('owner', role) ? (
        // mt-auto pushes the danger zone to the bottom of the page
        <div className="space-y-2 pb-4">
          <SectionHeading className="pt-4">Danger zone</SectionHeading>
          <Content>
            These are destructive actions and will irreversibly delete
            associated data.
          </Content>
          <div>
            <div className="flex flex-col space-y-6">
              <Button variant="destructive" onClick={clearDialog.onOpen}>
                <TrashIcon height={'1rem'} /> Clear app
              </Button>
              <Button variant="destructive" onClick={deleteDialog.onOpen}>
                <TrashIcon height={'1rem'} /> Delete app
              </Button>
            </div>
          </div>
          <Dialog {...clearDialog}>
            <div className="flex flex-col gap-2">
              <SubsectionHeading className="text-red-600">
                Clear app
              </SubsectionHeading>
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
                  await jsonFetch(
                    `${config.apiURI}/dash/apps/${app.id}/clear`,
                    {
                      method: 'POST',
                      headers: {
                        authorization: `Bearer ${token}`,
                        'content-type': 'application/json',
                      },
                    },
                  );

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
          <Dialog {...deleteDialog}>
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
        </div>
      ) : null}
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

/**
 * (XXX)
 * We could type the result of our fetches, and write a better error
 */
function errMessage(e: Error) {
  return e.message || 'An error occurred.';
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
  const [orgId, setOrgId] = useState<string | undefined>(orgs[0]?.id);
  const confirmationModal = useDialog();
  const token = useContext(TokenContext);

  async function transfer(
    { appId, orgId }: { appId: string; orgId: string },
    token: string,
  ) {
    dash.optimisticUpdateWorkspace(
      jsonFetch(
        `${config.apiURI}/dash/apps/${appId}/transfer_to_org/${orgId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      ),
      (prev) => {
        prev.apps.push({
          ...app,
          org: {
            id: orgId,
            title: orgs.find((o) => o.id === orgId)?.title || 'Unknown',
          },
        });
      },
    );

    dash.setWorkspace(orgId);
    dash.mutate();
    confirmationModal.onClose();
  }

  return (
    <div>
      <Dialog className="pt-5" {...confirmationModal}>
        <div className="-translate-y-1 bg-white text-[15px]">
          Are you sure you want to transfer <strong>{app.title}</strong> to{' '}
          <strong>
            {orgs.find((o) => o.id === orgId)?.title || 'Unknown'}
          </strong>
          ?
        </div>
        <div className="w-full pt-4 flex gap-2 justify-end items-end">
          <Button
            variant="subtle"
            onClick={() => {
              confirmationModal.onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              transfer(
                {
                  appId: app.id,
                  orgId: orgId!,
                },
                token,
              );
            }}
          >
            Transfer
          </Button>
        </div>
      </Dialog>
      <SectionHeading className="pt-4">Transfer App</SectionHeading>
      {orgs.length === 0 && (
        <p className="text-center py-2">No organizations to transfer to.</p>
      )}
      {orgs.length > 0 && (
        <div className="flex gap-2 flex-col">
          <div className="flex flex-col gap-1 pt-2">
            <Label className="opacity-70 font-normal">
              Destination Organization
            </Label>
            <Select
              disabled={orgs.length === 0}
              value={orgId}
              onChange={(o) => {
                if (!o) return;
                setOrgId(o.value as string);
              }}
              options={orgs.map((o) => ({ value: o.id, label: o.title }))}
            ></Select>
          </div>
          <Button
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

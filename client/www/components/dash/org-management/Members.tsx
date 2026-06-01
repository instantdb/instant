import { useReadyRouter } from '@/components/clientOnlyPage';
import { useFetchedDash } from '../MainDashLayout';
import { Badge, Button, SectionHeading, useDialog } from '@/components/ui';
import { InviteToOrgDialog } from './InviteToOrgDialog';
import { isMinRole, Role } from '@/pages/dash';
import config from '@/lib/config';
import { useAuthToken } from '@/lib/auth';
import { MemberMenu } from './MemberMenu';
import { useOrgPaid } from '@/lib/hooks/useOrgPaid';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/DropdownMenu';
import {
  ArrowUturnLeftIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/solid';
import Link from 'next/link';

const READABLE_ROLES: Record<string, string> = {
  admin: 'Admin',
  collaborator: 'Collaborator',
  owner: 'Owner',
};

export const Members = () => {
  const dashResponse = useFetchedDash();
  const router = useReadyRouter();
  const org = dashResponse.data.workspace;

  const paid = useOrgPaid();

  const canAddMembers = paid;

  const dialog = useDialog();
  const token = useAuthToken();

  const [, setTab] = useQueryState(
    'tab',
    parseAsStringEnum(['members', 'billing', 'manage']).withDefault('members'),
  );

  const revoke = async (inviteId: string) => {
    console.log('Revoking invite...', inviteId);
    if (org.type === 'personal') {
      throw new Error('Cannot revoke invite from personal workspace');
    }
    const responsePromise = fetch(
      `${config.apiURI}/dash/orgs/${org.id}/invite/revoke`,
      {
        body: JSON.stringify({ 'invite-id': inviteId, 'org-id': org.id }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        method: 'DELETE',
      },
    );

    dashResponse.optimisticUpdateWorkspace(responsePromise, (workspace) => {
      if (workspace.type === 'personal') {
        throw new Error('Cannot revoke invite from personal workspace');
      }
      const updatedWorkspace = { ...workspace };
      updatedWorkspace.invites = workspace.invites.filter(
        (invite) => invite.id !== inviteId,
      );
      return updatedWorkspace;
    });
    const result = await responsePromise;
    if (!result.ok) {
      throw new Error('Failed to revoke invite');
    }
  };

  if (
    dashResponse.data.currentWorkspaceId === 'personal' ||
    org.type === 'personal'
  ) {
    router.replace('/dash');
    return;
  }

  const invites = org.invites.filter(
    (invite) => invite.status !== 'accepted' && invite.status !== 'revoked',
  );
  const myRole = org.org.role as Role;
  const myEmail = dashResponse.data.user.email;

  const canInvite = isMinRole('admin', myRole);

  return (
    <div className="flex flex-col gap-6 pt-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <SectionHeading>Team members</SectionHeading>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              People with access to this organization and its apps.
            </p>
          </div>
          {canInvite && canAddMembers && (
            <Button onClick={() => dialog.onOpen()} size="mini">
              Invite
            </Button>
          )}
        </div>

        {canInvite && !canAddMembers && (
          <div className="rounded-sm border bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400">
            Inviting teammates is available on the Startup plan.{' '}
            <button
              type="button"
              onClick={() => setTab('billing')}
              className="font-medium text-[#606AF4] hover:underline"
            >
              Upgrade
            </button>
          </div>
        )}

        <InviteToOrgDialog dialog={dialog} />

        <div className="divide-y overflow-hidden rounded-sm border bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800">
          {org.members.map((member) => (
            <div
              className="flex w-full items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700/40"
              key={member.id}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{member.email}</span>
                {member.email === myEmail && <Badge>Me</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-neutral-400">
                  {READABLE_ROLES[member.role]}
                </span>
                <MemberMenu member={member} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <SectionHeading>Pending invites</SectionHeading>
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            Invites that haven't been accepted yet.
          </p>
        </div>
        {invites.length === 0 ? (
          <div className="rounded-sm border border-dashed px-3 py-6 text-center text-sm text-gray-400 dark:border-neutral-700 dark:text-neutral-500">
            No pending invites
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-sm border bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800">
            {invites.map((invite) => (
              <div
                className="flex w-full items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700/40"
                key={invite.id}
              >
                <div>{invite.email}</div>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <EllipsisHorizontalIcon
                      className="text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                      width={20}
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>
                      <button
                        type="button"
                        onClick={() => {
                          revoke(invite.id);
                        }}
                        className="flex gap-2"
                      >
                        <ArrowUturnLeftIcon width={14} />
                        Revoke Invite
                      </button>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

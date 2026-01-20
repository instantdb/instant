import { useReadyRouter } from '@/components/clientOnlyPage';
import { useFetchedDash } from '../MainDashLayout';
import {
  Badge,
  Button,
  Content,
  SubsectionHeading,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useDialog,
} from '@/components/ui';
import { InviteToOrgDialog } from './InviteToOrgDialog';
import { isMinRole, Role } from '@/pages/dash';
import config, { areTeamsFree } from '@/lib/config';
import { useAuthToken } from '@/lib/auth';
import { MemberMenu } from './MemberMenu';
import { useOrgPaid } from '@/lib/hooks/useOrgPaid';
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

  const freeTeams = areTeamsFree();

  const canAddMembers = paid || freeTeams;

  const dialog = useDialog();
  const token = useAuthToken();

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

  return (
    <div className="">
      <div className="flex items-end justify-between py-2">
        <SubsectionHeading>Current Members</SubsectionHeading>
        {isMinRole('admin', myRole) && (
          <Tooltip>
            <TooltipTrigger>
              <Button
                disabled={!canAddMembers}
                onClick={() => dialog.onOpen()}
                size="mini"
              >
                Invite
              </Button>
            </TooltipTrigger>
            {!canAddMembers && (
              <TooltipContent>
                Invitations are only available for paid orgs
              </TooltipContent>
            )}
          </Tooltip>
        )}
      </div>
      <InviteToOrgDialog dialog={dialog} />
      <div className="flex w-full py-2">
        {canAddMembers && !paid && (
          <Content className="w-full rounded-sm border border-purple-400 bg-purple-100 px-2 py-1 text-sm text-purple-800 italic dark:border-purple-500/50 dark:bg-purple-500/20 dark:text-white">
            Add your team members today to take advantage of{' '}
            <Link href="/essays/free_teams_through_february" target="_blank">
              free Teams
            </Link>{' '}
            through the end of February!
          </Content>
        )}
      </div>

      <div className="divide-y rounded-xs border bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800">
        {org.members.map((member) => (
          <div
            className="flex w-full items-center justify-between gap-2 rounded-xs p-2 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700/40"
            key={member.id}
          >
            <div className="flex items-center gap-3">
              {member.email}
              {member.email === myEmail && <Badge>Me</Badge>}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm">{READABLE_ROLES[member.role]}</div>
              <MemberMenu member={member} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <SubsectionHeading>Pending Invites</SubsectionHeading>
        {invites.length === 0 ? (
          <div className="w-full py-8 text-center text-sm opacity-50">
            No pending invites
          </div>
        ) : (
          <div className="divide-y border bg-white dark:border-neutral-700 dark:bg-neutral-800">
            {invites.map((invite) => (
              <div
                className="flex w-full items-center justify-between gap-2 p-2 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700/40"
                key={invite.id}
              >
                <div>{invite.email}</div>
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <EllipsisHorizontalIcon opacity={'50%'} width={20} />
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

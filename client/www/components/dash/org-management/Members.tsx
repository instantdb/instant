import { useReadyRouter } from '@/components/clientOnlyPage';
import { useFetchedDash } from '../MainDashLayout';
import {
  Badge,
  Button,
  SubsectionHeading,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useDialog,
} from '@/components/ui';
import { InviteToOrgDialog } from './InviteToOrgDialog';
import { isMinRole, Role } from '@/pages/dash';
import config from '@/lib/config';
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
      <div className="flex items-end py-2 justify-between">
        <SubsectionHeading>Current Members</SubsectionHeading>
        {isMinRole('admin', myRole) && (
          <Tooltip>
            <TooltipTrigger>
              <Button
                disabled={!paid}
                onClick={() => dialog.onOpen()}
                size="mini"
              >
                Invite
              </Button>
            </TooltipTrigger>
            {!paid && (
              <TooltipContent>
                Invitations are only available for paid orgs
              </TooltipContent>
            )}
          </Tooltip>
        )}
      </div>
      <InviteToOrgDialog dialog={dialog} />
      <div className="bg-white dark:bg-neutral-800 dark:border-neutral-700 border dark:divide-neutral-700 rounded-sm divide-y">
        {org.members.map((member) => (
          <div
            className="p-2 hover:bg-gray-50 dark:hover:bg-neutral-700/40 rounded-sm w-full flex gap-2 justify-between items-center transition-colors"
            key={member.id}
          >
            <div className="flex gap-3 items-center">
              {member.email}
              {member.email === myEmail && <Badge>Me</Badge>}
            </div>
            <div className="flex gap-3 items-center">
              <div className="text-sm">{READABLE_ROLES[member.role]}</div>
              <MemberMenu member={member} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <SubsectionHeading>Pending Invites</SubsectionHeading>
        {invites.length === 0 ? (
          <div className="w-full text-sm text-center opacity-50 py-8">
            No pending invites
          </div>
        ) : (
          <div className="bg-white dark:bg-neutral-800 border dark:border-neutral-700 divide-y">
            {invites.map((invite) => (
              <div
                className="p-2 hover:bg-gray-50 dark:hover:bg-neutral-700/40 w-full flex gap-2 justify-between items-center transition-colors"
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

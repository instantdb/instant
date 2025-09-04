import {
  ActionButton,
  Button,
  Dialog,
  Select,
  useDialog,
} from '@/components/ui';
import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { LockOpenIcon, TrashIcon } from '@heroicons/react/24/outline';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/solid';
import { useContext, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../DropdownMenu';
import { useFetchedDash } from '../MainDashLayout';
import { OrgWorkspace } from '@/lib/hooks/useWorkspace';
import { isMinRole, Role } from '@/pages/dash';
import { getAssignableRoles } from '@/lib/orgRoles';
import { jsonFetch } from '@/lib/fetch';
import { errorToast } from '@/lib/toast';

interface Member {
  id: string;
  email: string;
  role: Role;
}

interface MemberMenuProps {
  member: Member;
}

const getNiceNameForRole = (role: Role) => {
  const names: Record<Role, string> = {
    admin: 'Admin',
    'app-member': 'App Member', // filtered out
    collaborator: 'Collaborator',
    owner: 'Owner',
  };
  return names[role];
};

export const MemberMenu = ({ member }: MemberMenuProps) => {
  const deleteDialog = useDialog();
  const changeRoleDialog = useDialog();
  const [newRole, setNewRole] = useState(member.role);
  const token = useContext(TokenContext);
  const dash = useFetchedDash();
  const org = dash.data.workspace as OrgWorkspace;
  const myEmail = dash.data.user.email;

  const myRole = org.org.role as Role;

  const assignableRoles = getAssignableRoles({
    myRole: myRole,
    theirRole: member.role,
  });

  const handleChangeRole = async () => {
    try {
      await dash.optimisticUpdateWorkspace(
        jsonFetch(`${config.apiURI}/dash/orgs/${org.id}/members/update`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({
            id: member.id,
            role: newRole,
          }),
        }),
        (prev) => {
          // should never be true
          if (prev.type === 'personal') {
            return prev;
          }

          prev.members = prev.members.map((m) => {
            if (m.id === member.id) {
              return { ...m, role: newRole };
            }
            return m;
          });
        },
      );
      changeRoleDialog.onClose();
    } catch (err: any) {
      if (err.body.message) {
        errorToast(err.body.message);
      } else {
        errorToast("There was an error changing the user's role.");
      }
    }
  };

  const handleRemoveMember = () => {
    return dash.optimisticUpdateWorkspace(
      fetch(
        `${config.apiURI}/dash/orgs/${
          dash.data.currentWorkspaceId
        }/members/remove`,
        {
          body: JSON.stringify({
            id: member.id,
            'org-id': dash.data.currentWorkspaceId,
          }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          method: 'DELETE',
        },
      ),
      (workspace) => {
        if (workspace.type === 'personal') {
          return workspace;
        }
        deleteDialog.onClose();
        workspace.members = workspace.members.filter((m) => m.id !== member.id);
        return workspace;
      },
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <EllipsisHorizontalIcon opacity={'50%'} width={20} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            className="group"
            disabled={member.email === myEmail}
          >
            <button
              className="flex text-red-500 group-disabled:text-gray-400 gap-2 items-center"
              onClick={() => deleteDialog.onOpen()}
            >
              <TrashIcon width={14} />
              <div>Remove Member</div>
            </button>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="group"
            disabled={assignableRoles.length === 0}
          >
            <button
              className="flex group-disabled:text-gray-400 gap-2 items-center"
              onClick={() => changeRoleDialog.onOpen()}
            >
              <LockOpenIcon width={14} />
              Change Role
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteDialog.open} onClose={deleteDialog.onClose}>
        <div className="flex flex-col gap-4">
          <h5 className="flex items-center text-lg font-bold">Remove Member</h5>

          <p>
            Are you sure you want to remove <strong>{member.email}</strong> from
            this organization?
          </p>

          <ActionButton
            type="submit"
            variant="destructive"
            label="Remove Member"
            submitLabel="Removing..."
            successMessage="Member removed!"
            errorMessage="Failed to remove member."
            onClick={handleRemoveMember}
          />
        </div>
      </Dialog>
      <Dialog
        className="max-w-[400px]"
        open={changeRoleDialog.open}
        onClose={changeRoleDialog.onClose}
      >
        <div className="flex flex-col gap-4">
          <h5 className="flex items-center text-lg font-bold">Change Role</h5>
          <div>
            Select the new role for <strong>{member.email}</strong>
          </div>

          <Select
            value={newRole}
            onChange={(option) => setNewRole(option!.value)}
            options={assignableRoles.map((role) => ({
              value: role,
              label: getNiceNameForRole(role),
            }))}
          ></Select>
          <Button onClick={() => handleChangeRole()}>Save</Button>
        </div>
      </Dialog>
    </>
  );
};

import {
  ActionButton,
  Dialog,
  Label,
  Select,
  TextInput,
  useDialog,
} from '@/components/ui';
import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonMutate } from '@/lib/fetch';
import { useContext, useState } from 'react';
import { useFetchedDash } from '../MainDashLayout';

export const InviteToOrgDialog = ({
  dialog,
}: {
  dialog: ReturnType<typeof useDialog>;
}) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'collaborator' | 'owner'>(
    'collaborator',
  );
  const token = useContext(TokenContext);
  const dashResponse = useFetchedDash();

  function onSubmit() {
    return dashResponse.optimisticUpdateWorkspace(
      jsonMutate(
        `${config.apiURI}/dash/orgs/${
          dashResponse.data.currentWorkspaceId
        }/invite/send`,
        {
          token,
          body: {
            'invitee-email': email,
            role,
          },
        },
      ),
      (d) => {
        if (d.type === 'personal') {
          return;
        }
        dialog.onClose();
        d.invites.push({
          expired: false,
          id: Math.random().toString(36).substring(2, 15),
          sent_at: new Date().toISOString(),
          status: 'pending',
          email,
          role,
        });
      },
    );
  }

  return (
    <Dialog open={dialog.open} onClose={dialog.onClose}>
      <div className="flex flex-col gap-4">
        <h5 className="flex items-center text-lg font-bold">
          Invite to organization
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
              setRole(o.value as 'admin' | 'collaborator' | 'owner');
            }}
            options={[
              { value: 'owner', label: 'Owner' },
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
      </div>
    </Dialog>
  );
};

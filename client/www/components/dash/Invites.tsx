import { TokenContext } from '@/lib/contexts';
import { useContext } from 'react';
import { useFetchedDash } from './MainDashLayout';
import { ActionButton } from '@/components/ui';
import { jsonMutate } from '@/lib/fetch';
import config from '@/lib/config';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { SettingsEmptyState, SettingsSection } from './userSettingsShared';

export function Invites() {
  const token = useContext(TokenContext);
  const dashResponse = useFetchedDash();
  const invites = dashResponse.data.invites ?? [];

  return (
    <SettingsSection
      title="Team Invites"
      description="Accept an invite to join a team and collaborate on its apps."
    >
      {invites.length ? (
        <div className="flex flex-col gap-3">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-col gap-3 rounded-sm border p-4 dark:border-neutral-700"
            >
              <div className="text-sm">
                <strong>{invite.inviter_email}</strong> invited you to{' '}
                <strong>{invite.title}</strong> as{' '}
                <strong>{invite.invitee_role}</strong>.
              </div>
              <div className="flex gap-2">
                <ActionButton
                  variant="primary"
                  label="Accept"
                  submitLabel="Accepting..."
                  errorMessage="An error occurred when attempting to accept the invite."
                  successMessage={`You're part of the team for ${invite.title}!`}
                  onClick={async () => {
                    await jsonMutate(`${config.apiURI}/dash/invites/accept`, {
                      token,
                      body: {
                        'invite-id': invite.id,
                      },
                    });

                    await dashResponse.mutate();
                  }}
                />
                <ActionButton
                  label="Decline"
                  submitLabel="Decline..."
                  errorMessage="An error occurred when attempting to decline the invite."
                  onClick={async () => {
                    await jsonMutate(`${config.apiURI}/dash/invites/decline`, {
                      token,
                      body: {
                        'invite-id': invite.id,
                      },
                    });

                    await dashResponse.mutate();
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <SettingsEmptyState
          icon={<EnvelopeIcon height={28} />}
          title="No pending invites"
          description="When someone invites you to a team, it'll show up here."
        />
      )}
    </SettingsSection>
  );
}

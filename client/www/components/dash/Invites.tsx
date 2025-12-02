import { TokenContext } from '@/lib/contexts';
import { useContext } from 'react';
import { useFetchedDash } from './MainDashLayout';
import { ActionButton, Content, SectionHeading } from '../ui';
import { jsonMutate } from '@/lib/fetch';
import config from '@/lib/config';

export function Invites() {
  const token = useContext(TokenContext);
  const dashResponse = useFetchedDash();
  const invites = dashResponse.data.invites ?? [];

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="mb-2 flex text-4xl">📫</div>
      <SectionHeading>Team Invites</SectionHeading>
      <div className="flex flex-1 flex-col gap-4">
        {invites.length ? (
          invites.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-col justify-between gap-2"
            >
              <div>
                <strong>{invite.inviter_email}</strong> invited you to{' '}
                <strong>{invite.title}</strong> as{' '}
                <strong>{invite.invitee_role}</strong>.
              </div>
              <div className="flex gap-1">
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

                    const firstApp = dashResponse.data?.apps?.[0];
                    if (invites.length === 1 && firstApp) {
                      // nav({ s: 'main', t: 'home', app: firstApp.id });
                    }
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <Content className="dark:text-netural-400 text-gray-400 italic">
            You have no pending invites.
          </Content>
        )}
      </div>
    </div>
  );
}

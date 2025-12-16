import { Button, Content, Dialog, SectionHeading, useDialog } from '../ui';
import { claimTicket, voidTicket } from '@/lib/auth';
import { errorToast } from '@/lib/toast';
import { TicketSystem } from '@/lib/hooks/useTicketSystem';
import { useContext } from 'react';
import { TokenContext } from '@/lib/contexts';

export const CLILoginDialog = ({ tickets }: { tickets: TicketSystem }) => {
  const token = useContext(TokenContext);
  const { loginTicket, setLoginTicket } = tickets;
  const cliAuthCompleteDialog = useDialog();

  async function completeTicketFlow({
    ticket,
    token,
  }: {
    ticket: string;
    token: string;
  }) {
    try {
      await claimTicket({ ticket, token });
      cliAuthCompleteDialog.onOpen();
    } catch (error) {
      errorToast('Error completing CLI login.');
    }
  }

  return (
    <>
      <Dialog
        title="CLI Verification"
        open={cliAuthCompleteDialog.open}
        onClose={cliAuthCompleteDialog.onClose}
      >
        <div className="flex flex-col gap-4 p-4">
          <SectionHeading>Instant CLI verification complete!</SectionHeading>
          <Content>
            You can close this window and return to the terminal.
          </Content>
          <Button
            variant="secondary"
            onClick={() => {
              try {
                window.close();
              } catch (error) {}
              cliAuthCompleteDialog.onClose();
            }}
          >
            Close
          </Button>
        </div>
      </Dialog>
      <Dialog
        title="CLI Login"
        open={Boolean(loginTicket && token)}
        onClose={() => {
          if (loginTicket) {
            voidTicket({ ticket: loginTicket, token });
          }
          setLoginTicket(undefined);
        }}
      >
        <div className="flex flex-col gap-4 p-4">
          <SectionHeading>Instant CLI login</SectionHeading>
          <Content>
            Do you want to grant Instant CLI access to your account?
          </Content>
          <Button
            variant="primary"
            onClick={() => {
              if (loginTicket) {
                completeTicketFlow({ ticket: loginTicket, token });
              }
              setLoginTicket(undefined);
            }}
          >
            Log in
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (loginTicket) {
                voidTicket({ ticket: loginTicket, token });
              }
              setLoginTicket(undefined);
            }}
          >
            Deny
          </Button>
        </div>
      </Dialog>
    </>
  );
};

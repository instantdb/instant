import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { cliOauthParamName } from '@/lib/config';

export type TicketSystem = ReturnType<typeof useTicketSystem>;

export const useTicketSystem = () => {
  const readyRouter = useRouter();
  const [loginTicket, setLoginTicket] = useState<string | undefined>();

  const cliNormalTicket = readyRouter.query.ticket as string | undefined;
  const cliOauthTicket = readyRouter.query[cliOauthParamName] as
    | string
    | undefined;

  const cliTicket = cliNormalTicket || cliOauthTicket;

  useEffect(() => {
    if (cliTicket) setLoginTicket(cliTicket);
  }, [cliTicket]);

  return {
    loginTicket,
    cliNormalTicket,
    setLoginTicket,
  };
};

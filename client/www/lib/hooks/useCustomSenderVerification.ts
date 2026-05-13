// Manages state for verfication of custom sender email addresses for Auth.

import { useContext, useState } from 'react';
import { InstantApp } from '../types';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { TokenContext } from '../contexts';
import { errorToast, successToast } from '../toast';
import { jsonFetch, jsonMutate } from '../fetch';
import { config } from '../config';
import { SenderVerificationInfo } from '@/components/dash/auth/Email';

export function getSenderVerification({
  token,
  appId,
}: {
  token: string;
  appId: string;
}): Promise<{
  verification: SenderVerificationInfo | null;
  instant?: { 'verified?': boolean };
}> {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/sender-verification`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
}

function sendSenderVerificationCode({
  token,
  appId,
}: {
  token: string;
  appId: string;
}): Promise<{ sent: boolean }> {
  return jsonMutate(
    `${config.apiURI}/dash/apps/${appId}/sender-verification/send-magic-code`,
    {
      token,
    },
  );
}

function verifySenderVerificationCode({
  token,
  appId,
  code,
}: {
  token: string;
  appId: string;
  code: string;
}): Promise<{ verified: boolean }> {
  return jsonMutate(
    `${config.apiURI}/dash/apps/${appId}/sender-verification/verify-magic-code`,
    {
      token,
      body: { code },
    },
  );
}

export const useCustomSenderVerification = (app: InstantApp) => {
  const template = app.magic_code_email_template;
  const token = useContext(TokenContext);

  const resp = useSWR(
    [app.id, template?.id],
    () =>
      getSenderVerification({
        appId: app.id,
        token: token,
      }),
    {
      onError: (e) => {
        console.error('Failed to check verification:', e);
        errorToast('Failed to check verification status');
      },
    },
  );

  const [justSentCode, setJustSentCode] = useState(false);

  const sendCode = async () => {
    const rep = await sendSenderVerificationCode({ token, appId: app.id });
    if (!rep.sent) {
      throw new Error('Failed to send verification code');
    }
    setJustSentCode(true);
    successToast(
      `Verification code sent to ${resp.data?.verification?.EmailAddress}`,
    );
  };

  const verifyCode = useSWRMutation(
    ['verify-sender-verification-code', app.id],
    async (_key, { arg }: { arg: string }) => {
      const normalizedCode = arg.replace(/\D/g, '').slice(0, 6);
      if (normalizedCode.length !== 6) {
        errorToast('Enter the 6-digit verification code');
        return;
      }

      const verified = await verifySenderVerificationCode({
        token: token,
        appId: app.id,
        code: normalizedCode,
      });
      return verified;
    },
    {
      onSuccess: () => {
        successToast('Sender email verified!');
        resp.mutate();
      },
      onError: (e) => {
        errorToast('Failed to verify code: ' + e.message);
      },
    },
  );

  return {
    raw: resp,
    instantVerified: resp.data?.instant?.['verified?'] ?? false,
    postmarkVerified: resp.data?.verification?.Confirmed ?? false,
    loading: resp.isValidating,
    refetch: resp.mutate,
    justSentCode,
    sendCode,
    verifyCode,
  };
};

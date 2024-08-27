import { ReactNode, useState } from 'react';
import { sendMagicCode, verifyMagicCode } from '../../lib/auth';
import {
  Button,
  Content,
  Divider,
  LogoIcon,
  ScreenHeading,
  TextInput,
} from '../ui';
import config, { isDev } from '@/lib/config';
import googleIconSvg from '../../public/google_g.svg';
import Image from 'next/image';
import { InstantError } from '@/lib/types';
import { url } from '@/lib/url';

type State = {
  sentEmail: string | undefined;
  email: string;
  code: string;
  error: string | undefined;
  isLoading: boolean;
};

function CodeStep(props: {
  sentEmail: string;
  email: string;
  code: string;
  onEmailChange: (text: string) => void;
  onCodeChange: (text: string) => void;
  onVerifyCode: () => void;
  onSendCode: () => void;
  onBackToLogin: () => void;
  disabled: boolean | undefined;
  error?: string;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        props.onVerifyCode();
      }}
    >
      <ScreenHeading>Enter your code</ScreenHeading>
      <Content>
        We sent an email to <strong>{props.sentEmail}</strong>. Check your
        email, and paste the code you see.
      </Content>
      <TextInput
        autoFocus
        className="w-full appearance-none rounded outline-none"
        placeholder="Your code"
        inputMode="numeric"
        value={props.code}
        onChange={(_) => props.onCodeChange(_)}
        error={props.error}
      />
      <Button
        type="submit"
        disabled={props.disabled || props.code.trim().length === 0}
      >
        Verify Code
      </Button>
      <Button variant="subtle" onClick={() => props.onBackToLogin()}>
        Back to Login
      </Button>
    </form>
  );
}

function EmailStep(props: {
  email: string;
  emailOnly?: boolean;
  onEmailChange: (text: string) => void;
  onSendCode: () => void;
  disabled: boolean | undefined;
  error?: string;
  ticket?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          props.onSendCode();
        }}
      >
        <ScreenHeading>Let's log you in</ScreenHeading>
        <Content>
          Enter your email, and we’ll send you a verification code. We'll create
          an account for you too if you don't already have one :)
        </Content>
        <TextInput
          autoFocus
          className="w-full rounded"
          placeholder="Enter your email address"
          type="email"
          value={props.email}
          onChange={(_) => props.onEmailChange(_)}
          error={props.error}
        />
        <Button
          type="submit"
          disabled={props.disabled || props.email.trim().length === 0}
        >
          Send Code
        </Button>
      </form>
      {props.emailOnly ? null : (
        <>
          <Divider>
            <span className="mx-4 text-xs text-gray-900">OR</span>
          </Divider>
          <Button
            variant="secondary"
            type="link"
            href={url(config.apiURI, `/dash/oauth/start`, {
              ticket: props.ticket,
              redirect_to_dev: isDev ? 'true' : undefined,
            })}
          >
            <span className="flex items-center space-x-2">
              <Image src={googleIconSvg} width={16} />
              <span>Continue with Google</span>
            </span>
          </Button>
        </>
      )}
    </div>
  );
}

export default function Auth(props: {
  emailOnly?: boolean;
  info?: ReactNode;
  ticket?: string;
  onVerified?: ({ token, ticket }: { token: string; ticket?: string }) => void;
}) {
  const [{ sentEmail, email, code, error, isLoading }, setState] =
    useState<State>({
      sentEmail: '',
      email: '',
      code: '',
      error: '',
      isLoading: false,
    });

  const sendCode = () => {
    setState((prev) => ({
      ...prev,
      error: undefined,
      sentEmail: email,
      isLoading: false,
    }));

    sendMagicCode({ email }).catch((err) => {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        sentEmail: undefined,
        error: errorFromSendMagicCode(err),
      }));
    });
  };

  const verifyCode = () => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
    }));

    verifyMagicCode({ email, code }).then(
      ({ token }) => {
        props.onVerified?.({ token, ticket: props.ticket });
      },
      (err) => {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorFromVerifyMagicCode(err),
        }));
      }
    );
  };

  const onEmailChange = (email: string) =>
    setState((prev) => ({ ...prev, email: email }));

  const onCodeChange = (code: string) =>
    setState((prev) => ({ ...prev, code: code }));

  const backToLogin = () => {
    setState((prev) => ({
      ...prev,
      sentEmail: undefined,
      code: '',
      error: undefined,
    }));
  };
  return (
    <div className="flex h-screen items-center justify-center p-4">
      <div className="max-w-sm">
        <span className="inline-flex items-center space-x-2">
          <LogoIcon />
          <span className="font-mono text-sm lowercase text-gray-400">
            Instant
          </span>
        </span>
        <div className="flex flex-col gap-4">
          {sentEmail ? (
            <CodeStep
              sentEmail={sentEmail}
              disabled={isLoading}
              email={email}
              onEmailChange={onEmailChange}
              code={code}
              onCodeChange={onCodeChange}
              onVerifyCode={verifyCode}
              onSendCode={sendCode}
              onBackToLogin={backToLogin}
              error={error}
            />
          ) : (
            <EmailStep
              emailOnly={props.emailOnly}
              disabled={isLoading}
              email={email}
              onEmailChange={onEmailChange}
              onSendCode={sendCode}
              error={error}
              ticket={props.ticket}
            />
          )}
          {props.info ?? null}
        </div>
      </div>
    </div>
  );
}

function errorFromVerifyMagicCode(res: InstantError): string {
  const errorType = res.body?.type;
  switch (errorType) {
    case 'param-missing':
      return 'Please enter your code';
    case 'param-malformed':
      return "Is there a typo with your code? We couldn't recognize it.";
    case 'record-not-found':
      return "This code isn't valid. Please check your email for the latest code.";
    case 'record-expired':
      return 'This code has expired. Please request a new code.';
    default:
      return 'Uh oh, something went wrong sending you a magic code, please ping us!';
  }
}

function errorFromSendMagicCode(res: InstantError): string {
  const errorType = res.body?.type;
  const defaultMsg =
    'Uh oh, something went wrong sending you a magic code, please ping us!';
  switch (errorType) {
    case 'param-missing':
      return 'Please enter your email address.';
    case 'param-malformed':
      return "Is there a typo with your email? We couldn't recognize it.";
    case 'validation-failed':
      const hintMsg = res.body?.hint?.errors?.[0]?.message;
      return hintMsg || defaultMsg;
    default:
      return defaultMsg;
  }
}

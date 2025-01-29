import { StyledToastContainer } from '@/lib/toast';
import { NextRouter, useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { Button, Content, ScreenHeading } from '@/components/ui';
import { exchangeOAuthCodeForToken, messageFromInstantError } from '@/lib/auth';
import config, { cliOauthParamName } from '@/lib/config';
import { InstantError } from '@/lib/types';

type CallbackState =
  | { type: 'router-loading' }
  | { type: 'exchange-code'; code: string; ticket?: string }
  | { type: 'login' }
  | { type: 'error'; error: string };

function LoadingScreen() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 p-4">
        <span className="animate-slow-pulse text-center">Loading...</span>
      </div>
    </div>
  );
}
const ErrorBubble: React.FC<{ error: string }> = ({ error }) => (
  <div className="rounded bg-red-100 px-3 py-1.5 text-sm text-red-600">
    {error}
  </div>
);

function ErrorScreen({ error }: { error: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 p-4">
        <p className="text-center text-2xl font-bold text-gray-600">
          There was an error
        </p>
        <ErrorBubble error={error} />
        <Button type="link" href="/dash">
          Back to the dash
        </Button>
      </div>
    </div>
  );
}

function LoginScreen() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-4 p-4">
        <ScreenHeading className="text-center">Log in</ScreenHeading>
        <Content className="text-center">
          <a href={`${config.apiURI}/dash/oauth/start`}>Log in with Google</a>
        </Content>
      </div>
    </div>
  );
}

function stateFromRouter(router: NextRouter): CallbackState {
  if (!router.isReady) {
    return { type: 'router-loading' };
  }
  if (typeof router.query.code === 'string') {
    return {
      type: 'exchange-code',
      code: router.query.code,
      ticket: router.query.ticket as string | undefined,
    };
  }
  if (typeof router.query.error === 'string') {
    return { type: 'error', error: router.query.error };
  }
  return { type: 'login' };
}

const CallbackScreen = ({ state }: { state: CallbackState }) => {
  if (
    state.type === 'router-loading' ||
    state.type === 'exchange-code' ||
    state.type === 'login'
  ) {
    return <LoadingScreen />;
  }
  if (state.type === 'error') {
    return <ErrorScreen error={state.error} />;
  }
  return <LoginScreen />;
};

export default function OAuthCallback() {
  const router = useRouter();

  const [state, setState] = useState<CallbackState>(stateFromRouter(router));

  useEffect(() => {
    if (router.isReady && state.type === 'router-loading') {
      setState(stateFromRouter(router));
    }
  }, [router.isReady, state.type]);

  useEffect(() => {
    switch (state.type) {
      case 'exchange-code': {
        const { code: _, ...queryWithoutCode } = router.query;
        router.replace({
          pathname: router.pathname,
          query: queryWithoutCode,
        });

        exchangeOAuthCodeForToken({
          code: state.code,
        })
          .then(async (res) => {
            const ticket = state.ticket;
            const path = res.redirect_path || '/dash';

            if (!ticket) {
              router.push(path);
              return;
            }

            const url = new URL(path, window.location.origin);
            url.searchParams.set(cliOauthParamName, ticket);
            const finalPath = url.href.replace(window.location.origin, '');
            router.push(finalPath);
          })
          .catch((res) => {
            const error = messageFromInstantError(res as InstantError);

            setState({
              type: 'error',
              error: error || 'Error logging in.',
            });
          });
        break;
      }
      case 'error': {
        if (router.query.error) {
          const { error: _, ...queryWithoutCode } = router.query;
          router.replace({
            pathname: router.pathname,
            query: queryWithoutCode,
          });
        }
        break;
      }
      case 'login': {
        router.replace('/dash');
        break;
      }
    }
  }, [state]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden md:flex-row">
      <Head>
        <title>Instant - Log in with Google</title>
        <meta name="description" content="Welcome to Instant." />
      </Head>
      <CallbackScreen state={state} />
      <StyledToastContainer />
    </div>
  );
}

import { asClientOnlyPage, useReadyRouter } from '@/components/clientOnlyPage';
import Auth from '@/components/dash/Auth';
import { Loading } from '@/components/dash/shared';
import { Button, Content, FullscreenLoading, LogoIcon } from '@/components/ui';
import { useAuthToken } from '@/lib/auth';
import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { useEffect, useRef, useState } from 'react';

function InvalidRedirect({ explanation }: { explanation: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="max-w-sm flex flex-col gap-4">
        <span className="inline-flex items-center space-x-2">
          <LogoIcon />
          <span className="font-mono text-sm lowercase text-gray-400">
            Instant
          </span>
        </span>

        <Content>
          <p>
            It looks like you're trying to give an external service access to
            your Instant account, but {explanation}.
          </p>
          <p>
            Please go back and try again, or ping us on{' '}
            <a
              className="font-bold text-blue-500"
              href="https://discord.com/invite/VU53p7uQcE"
              target="_blank"
            >
              discord
            </a>{' '}
            with details.
          </p>
        </Content>
      </div>
    </div>
  );
}

function OAuthForm({ redirectId }: { redirectId: string }) {
  const token = useAuthToken();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) {
      return;
    }
    hasFetched.current = true;
    jsonFetch(`${config.apiURI}/platform/oauth/claim`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ redirect: redirectId }),
    })
      .catch((e) => {
        console.error(e);
        setError(e);
      })
      .then((data) => setData(data));
  }, [redirectId]);

  if (!data && !error) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden md:flex-row">
        <div className="flex flex-1 flex-col overflow-hidden">
          <FullscreenLoading />
        </div>
      </div>
    );
  }

  if (error) {
    // XXX: Extract the actual error
    return <InvalidRedirect explanation="there was an error" />;
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="max-w-sm flex flex-col gap-4">
        <span className="inline-flex items-center space-x-2">
          <LogoIcon />
          <span className="font-mono text-sm lowercase text-gray-400">
            Instant
          </span>
        </span>

        <Content>
          <p>{data.appName} wants access to your Instant account.</p>
          <p>They will be able to:</p>
          <ul>
            <li>Create new apps in your account.</li>
            <li>Update the schema for the apps in your account.</li>
            {/* XXX: List all of the things */}
            <li>Other things.</li>
          </ul>
        </Content>

        <form
          className="flex flex-col"
          action={`${config.apiURI}/platform/oauth/grant`}
          method="POST"
        >
          <input type="hidden" name="redirect_id" value={redirectId} />
          <input type="hidden" name="grant_token" value={data.grantToken} />
          <Button variant="secondary" type="submit">
            Grant access
          </Button>
        </form>

        <form
          className="flex flex-col"
          action={`${config.apiURI}/platform/oauth/deny`}
          method="POST"
        >
          <input type="hidden" name="redirect_id" value={redirectId} />
          <input type="hidden" name="grant_token" value={data.grantToken} />
          <Button variant="secondary" type="submit">
            Deny access
          </Button>
        </form>
      </div>
    </div>
  );
}

function ClientPage() {
  const token = useAuthToken();
  const router = useReadyRouter();

  const redirectId = router.query['redirect-id'] as string | null;

  if (!redirectId) {
    return (
      <InvalidRedirect explanation="the request is missing essential information" />
    );
  }

  if (!token) {
    return <Auth />;
  }

  return <OAuthForm redirectId={redirectId} />;
}

const Page = asClientOnlyPage(ClientPage);

export default Page;

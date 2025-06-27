import React, { useCallback, useContext, useEffect, useState } from 'react';
import { ClipboardDocumentIcon, PlusIcon } from '@heroicons/react/24/outline';
import format from 'date-fns/format';
import CopyToClipboard from 'react-copy-to-clipboard';

import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import {
  ActionButton,
  ActionForm,
  Button,
  cn,
  Content,
  Copyable,
  Dialog,
  Label,
  SectionHeading,
  SubsectionHeading,
} from '@/components/ui';
import { TokenContext } from '@/lib/contexts';
import { errorToast, successToast } from '@/lib/toast';
import { AppLogo } from './OAuthApps';
import { ArrowPathIcon } from '@heroicons/react/24/solid';

type OAuthApp = {
  id: string;
  name: string;
  logo: string;
  homePage: string;
  privacyPolicyLink: string;
  tosLink: string;
};

async function fetchOAuthApps(token: string): Promise<OAuthApp[]> {
  console.log('fetch apps');

  const data = await jsonFetch(`${config.apiURI}/dash/user/oauth_apps`, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
  });
  return data.oauthApps;
}

async function revokeOAuthApp(
  token: string,
  oauthAppId: string,
): Promise<OAuthApp[]> {
  const data = await jsonFetch(
    `${config.apiURI}/dash/user/oauth_apps/revoke_access`,
    {
      body: JSON.stringify({ oauthAppId }),
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
    },
  );

  return data.oauthApps;
}

function useOAuthApps(
  token: string,
): [
  OAuthApp[],
  boolean,
  any,
  () => Promise<void>,
  (id: string) => Promise<void>,
] {
  const [isLoading, setIsLoading] = useState(true);
  const [oAuthApps, setOAuthApps] = useState<OAuthApp[]>([]);
  const [error, setError] = useState<any | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const results = await fetchOAuthApps(token);
      console.log('results', results);
      setOAuthApps(results);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const revoke = useCallback(
    async (id: string) => {
      if (!token) {
        return;
      }
      const results = await revokeOAuthApp(token, id);
      setOAuthApps(results);
    },
    [token],
  );

  useEffect(() => {
    refresh();
  }, [refresh, token]);

  return [oAuthApps, isLoading, error, refresh, revoke];
}

export default function OAuthAppsTab({ className }: { className?: string }) {
  const authToken = useContext(TokenContext);
  const [oAuthApps, isLoading, error, refresh, revoke] =
    useOAuthApps(authToken);

  const handleRevokeAccess = async ({
    name,
    id,
  }: {
    name: string;
    id: string;
  }) => {
    if (!confirm(`Are you sure you want to revoke access to ${name}?`)) {
      return;
    }

    try {
      await revoke(id);
    } catch (err: any) {
      console.error('Failed to revoke access:', err);
      errorToast(`Failed to revoke access: ${err.body.message}`);
    }
  };
  return (
    <div className={cn('flex-1 flex flex-col p-4 max-w-2xl', className)}>
      <div className="flex flex-row items-center gap-4 pb-4">
        <SectionHeading className="font-bold">
          Authorized OAuth Apps
        </SectionHeading>
        <Button onClick={refresh} variant="subtle" size="mini">
          <ArrowPathIcon height={20} />
        </Button>
      </div>
      {error ? <div>{error.message}</div> : null}
      <Content>
        <p>
          Below are any OAuth apps that you have granted access to your Instant
          Account.
        </p>
      </Content>
      <div className="space-y-4 mt-4">
        {(oAuthApps || []).map(
          ({ id, name, logo, homePage, privacyPolicyLink, tosLink }) => (
            <div className="flex flex-row gap-4 items-center group">
              <div key={id} className="flex h-full">
                <AppLogo app={{ appLogo: logo, appName: name }} />
              </div>
              <Content>
                <p>
                  {homePage ? (
                    <a
                      href={homePage}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {name}
                    </a>
                  ) : (
                    name
                  )}
                  <span>
                    {tosLink || privacyPolicyLink ? (
                      <>
                        <br />
                        <span className="text-xs">
                          {tosLink ? (
                            <a
                              href={tosLink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Terms of Service
                            </a>
                          ) : null}{' '}
                          {privacyPolicyLink ? (
                            <a
                              href={privacyPolicyLink}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Privacy Policy
                            </a>
                          ) : null}
                        </span>
                      </>
                    ) : null}
                  </span>
                </p>
              </Content>
              <Button
                className="group-hover:block hidden text-sm ml-4"
                variant="destructive"
                onClick={() => handleRevokeAccess({ id, name })}
              >
                Revoke access
              </Button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

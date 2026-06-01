import { useCallback, useContext, useEffect, useState } from 'react';
import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import {
  Button,
  Content,
  Dialog,
  IconButton,
  SubsectionHeading,
} from '@/components/ui';
import { Loading } from '@/components/dash/shared';
import { TokenContext } from '@/lib/contexts';
import { errorToast } from '@/lib/toast';
import { AppLogo } from './OAuthApps';
import { ArrowPathIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import {
  SettingsEmptyState,
  SettingsList,
  SettingsSection,
} from './userSettingsShared';

type OAuthApp = {
  id: string;
  name: string;
  logo: string;
  homePage: string;
  privacyPolicyLink: string;
  tosLink: string;
};

async function fetchOAuthApps(token: string): Promise<OAuthApp[]> {
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

export default function OAuthAppsTab() {
  const authToken = useContext(TokenContext);
  const [oAuthApps, isLoading, error, refresh, revoke] =
    useOAuthApps(authToken);
  const [pendingRevoke, setPendingRevoke] = useState<OAuthApp | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const handleRevokeAccess = async () => {
    if (!pendingRevoke) {
      return;
    }
    try {
      setIsRevoking(true);
      await revoke(pendingRevoke.id);
      setPendingRevoke(null);
    } catch (err: any) {
      console.error('Failed to revoke access:', err);
      errorToast(
        `Failed to revoke access: ${err.body?.message ?? err.message}`,
      );
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <SettingsSection
      title="OAuth Apps"
      description="Apps you've granted access to your Instant account."
      action={
        <IconButton
          variant="subtle"
          label="Refresh"
          onClick={refresh}
          icon={<ArrowPathIcon height={16} />}
        />
      }
    >
      {error ? <p className="text-sm text-red-500">{error.message}</p> : null}

      {isLoading ? (
        <Loading />
      ) : oAuthApps.length ? (
        <SettingsList>
          {oAuthApps.map(
            ({ id, name, logo, homePage, privacyPolicyLink, tosLink }) => (
              <div
                key={id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <AppLogo app={{ appLogo: logo, appName: name }} />
                  <div className="flex flex-col">
                    {homePage ? (
                      <a
                        href={homePage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                      >
                        {name}
                      </a>
                    ) : (
                      <span className="font-medium">{name}</span>
                    )}
                    {tosLink || privacyPolicyLink ? (
                      <span className="flex gap-2 text-xs text-gray-400 dark:text-neutral-500">
                        {tosLink ? (
                          <a
                            href={tosLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            Terms of Service
                          </a>
                        ) : null}
                        {privacyPolicyLink ? (
                          <a
                            href={privacyPolicyLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            Privacy Policy
                          </a>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPendingRevoke({
                      id,
                      name,
                      logo,
                      homePage,
                      privacyPolicyLink,
                      tosLink,
                    })
                  }
                  className="cursor-pointer text-sm text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
                >
                  Revoke
                </button>
              </div>
            ),
          )}
        </SettingsList>
      ) : (
        <SettingsEmptyState
          icon={<ShieldCheckIcon height={28} />}
          title="No authorized apps"
          description="Apps you grant access to your Instant account will show up here."
        />
      )}

      <Dialog
        title="Revoke access"
        open={Boolean(pendingRevoke)}
        onClose={() => setPendingRevoke(null)}
      >
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Revoke {pendingRevoke?.name}</SubsectionHeading>
          <Content>
            {pendingRevoke?.name} will lose access to your Instant account. You
            can grant access again at any time.
          </Content>
          <Button
            variant="destructive"
            loading={isRevoking}
            onClick={handleRevokeAccess}
          >
            Revoke access
          </Button>
        </div>
      </Dialog>
    </SettingsSection>
  );
}

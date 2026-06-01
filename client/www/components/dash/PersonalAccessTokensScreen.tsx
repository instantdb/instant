import { useCallback, useContext, useEffect, useState } from 'react';
import { KeyIcon, PlusIcon } from '@heroicons/react/24/outline';
import format from 'date-fns/format';

import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import {
  Badge,
  Button,
  Content,
  Copyable,
  Dialog,
  Label,
  SubsectionHeading,
  useDialog,
} from '@/components/ui';
import { Loading } from '@/components/dash/shared';
import { TokenContext } from '@/lib/contexts';
import { errorToast, successToast } from '@/lib/toast';
import {
  SettingsEmptyState,
  SettingsList,
  SettingsSection,
} from './userSettingsShared';

type PersonalAccessToken = {
  id: string;
  name: string;
  created_at: number;
};

async function fetchPersonalAccessTokens(
  token: string,
): Promise<PersonalAccessToken[]> {
  const { data } = await jsonFetch(
    `${config.apiURI}/dash/personal_access_tokens`,
    {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
    },
  );

  return data;
}

async function createPersonalAccessToken(
  token: string,
  name: string,
): Promise<PersonalAccessToken & { token: string }> {
  const { data } = await jsonFetch(
    `${config.apiURI}/dash/personal_access_tokens`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    },
  );

  return data;
}

async function deletePersonalAccessToken(
  token: string,
  personalAccessTokenId: string,
): Promise<any> {
  const { data } = await jsonFetch(
    `${config.apiURI}/dash/personal_access_tokens/${personalAccessTokenId}`,
    {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
    },
  );

  return data;
}

function usePersonalAccessTokens(
  token: string,
): [PersonalAccessToken[], boolean, any, () => Promise<void>] {
  const [isLoading, setIsLoading] = useState(true);
  const [personalAccessTokens, setPersonalAccessTokens] = useState<
    PersonalAccessToken[]
  >([]);
  const [error, setError] = useState<any | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const results = await fetchPersonalAccessTokens(token);

      setPersonalAccessTokens(results);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh, token]);

  return [personalAccessTokens, isLoading, error, refresh];
}

function CopyTokenDialog({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  return (
    <Dialog title="Copy token" open={Boolean(token)} onClose={onClose}>
      <div className="flex min-w-0 flex-col gap-2">
        <SubsectionHeading>Copy your token</SubsectionHeading>
        <Content>
          <p>
            Copy and save your token somewhere safe. Instant does not keep a
            copy, so you'll need to generate a new one if this is lost.
          </p>
        </Content>
        <div className="w-full max-w-full min-w-0 overflow-x-auto">
          <Copyable value={token} label="Token" defaultHidden={true} />
        </div>
      </div>
    </Dialog>
  );
}

export default function PersonalAccessTokensTab() {
  const authToken = useContext(TokenContext);
  const [personalAccessTokens = [], isLoading, , refreshPersonalAccessTokens] =
    usePersonalAccessTokens(authToken);
  const createDialog = useDialog();
  const [newTokenName, setNewTokenName] = useState('Platform Token');
  const [isCreating, setIsCreating] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<PersonalAccessToken | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleGenerateNewToken = async () => {
    try {
      setIsCreating(true);
      const token = await createPersonalAccessToken(authToken, newTokenName);
      await refreshPersonalAccessTokens();
      createDialog.onClose();
      setNewTokenName('Platform Token');
      successToast(`Created "${newTokenName}"`);
      setNewTokenValue(token.token);
    } catch (err: any) {
      console.error('Failed to create token:', err);
      errorToast(`Failed to create token: ${err.body?.message ?? err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteToken = async () => {
    if (!pendingDelete) {
      return;
    }
    try {
      setIsDeleting(true);
      await deletePersonalAccessToken(authToken, pendingDelete.id);
      await refreshPersonalAccessTokens();
      setPendingDelete(null);
    } catch (err: any) {
      console.error('Failed to delete:', err);
      errorToast(`Failed to delete: ${err.body?.message ?? err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SettingsSection
      title={
        <span className="flex items-center gap-2">
          Access Tokens <Badge>Beta</Badge>
        </span>
      }
      description={
        <>
          Create personal access tokens to use the platform API and create apps
          on demand.{' '}
          <a
            className="underline hover:text-gray-700 dark:hover:text-white"
            href="/labs/platform_demo"
          >
            View the guide
          </a>
          .
        </>
      }
      action={
        <Button variant="primary" onClick={createDialog.onOpen}>
          <PlusIcon className="mr-1 h-4 w-4" /> New access token
        </Button>
      }
    >
      {isLoading ? (
        <Loading />
      ) : personalAccessTokens.length ? (
        <SettingsList>
          {personalAccessTokens.map(({ id, name, created_at }) => (
            <div
              key={id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">{name}</span>
                <span className="text-sm text-gray-400 dark:text-neutral-500">
                  Created {format(new Date(created_at), 'MMM d, yyyy')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete({ id, name, created_at })}
                className="cursor-pointer text-sm text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
        </SettingsList>
      ) : (
        <SettingsEmptyState
          icon={<KeyIcon height={28} />}
          title="No access tokens yet"
          description="Create a token to use the platform API and create apps on demand."
        />
      )}

      <Dialog
        title="Create token"
        open={createDialog.open}
        onClose={createDialog.onClose}
      >
        <div className="flex flex-col gap-4">
          <SubsectionHeading>Create personal access token</SubsectionHeading>
          <div className="flex flex-col gap-1">
            <Label>Name</Label>
            <input
              className="flex w-full rounded-xs border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400 dark:border-neutral-700 dark:bg-neutral-800"
              placeholder="My default token"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={createDialog.onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={isCreating}
              onClick={handleGenerateNewToken}
            >
              Create
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        title="Delete token"
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      >
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Delete {pendingDelete?.name}</SubsectionHeading>
          <Content>
            Any code using this token will stop working. This can't be undone.
          </Content>
          <Button
            variant="destructive"
            loading={isDeleting}
            onClick={handleDeleteToken}
          >
            Delete token
          </Button>
        </div>
      </Dialog>

      {newTokenValue ? (
        <CopyTokenDialog
          onClose={() => setNewTokenValue(null)}
          token={newTokenValue}
        />
      ) : null}
    </SettingsSection>
  );
}

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ChevronRightIcon,
  ClipboardDocumentIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import format from 'date-fns/format';
import CopyToClipboard from 'react-copy-to-clipboard';

import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import {
  ActionButton,
  ActionForm,
  Button,
  Checkbox,
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

function CopyButton({ value }: { value: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleClick = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <CopyToClipboard text={value}>
      <Button
        className="w-20"
        variant="secondary"
        size="mini"
        onClick={handleClick}
      >
        {!isCopied && <ClipboardDocumentIcon className="-ml-0.5 h-4 w-4" />}
        {isCopied ? 'Copied!' : 'Copy'}
      </Button>
    </CopyToClipboard>
  );
}

function CopyText({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  const [isCopied, setIsCopied] = useState(false);

  const handleClick = () => {
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <CopyToClipboard text={value}>
      <button
        className={cn(className, isCopied ? 'opacity-60' : '')}
        onClick={handleClick}
      >
        {isCopied ? <span>Copied to clipboard!</span> : <span>{label}</span>}
      </button>
    </CopyToClipboard>
  );
}

function CopyTokenDialog({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(token)} onClose={onClose}>
      <SubsectionHeading>Copy your token</SubsectionHeading>
      <div className="flex flex-col gap-2 p-2">
        <Content>
          <p>
            Copy and save your token somewhere safe. Instant does not keep a
            copy of the token. You will have to generate a new token if this one
            is lost.
          </p>
        </Content>
        <div>
          <Copyable value={token} label="Token" defaultHidden={true} />
        </div>
      </div>
    </Dialog>
  );
}

export default function PersonalAccessTokensTab({
  className,
}: {
  className?: string;
}) {
  const authToken = useContext(TokenContext);
  const [
    personalAccessTokens = [],
    isLoadingPersonalAccessTokens,
    personalAccessTokensError,
    refreshPersonalAccessTokens,
  ] = usePersonalAccessTokens(authToken);
  const [isCreatingNewToken, setIsCreatingNewToken] = useState(false);
  const [newPersonalAccessTokenName, setNewPersonalAccessTokenName] =
    useState('Platform Token');
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);

  const handleGenerateNewToken = async () => {
    try {
      const token = await createPersonalAccessToken(
        authToken,
        newPersonalAccessTokenName,
      );
      await refreshPersonalAccessTokens();
      setIsCreatingNewToken(false);
      setNewPersonalAccessTokenName('');
      successToast(`Successfully generated "${newPersonalAccessTokenName}"`);
      setNewTokenValue(token.token);
    } catch (err: any) {
      console.error('Failed to create token:', err);
      errorToast(`Failed to create token: ${err.body.message}`);
    }
  };

  const handleDeleteToken = async (id: string) => {
    if (!confirm(`Are you sure you want to delete this token?`)) {
      return;
    }

    try {
      await deletePersonalAccessToken(authToken, id);
      await refreshPersonalAccessTokens();
    } catch (err: any) {
      console.error('Failed to delete:', err);
      errorToast(`Failed to delete: ${err.body.message}`);
    }
  };
  return (
    <div
      className={cn('flex-1 flex flex-col p-4 max-w-2xl mx-auto', className)}
    >
      {newTokenValue ? (
        <CopyTokenDialog
          onClose={() => setNewTokenValue(null)}
          token={newTokenValue}
        />
      ) : null}
      <div className="flex justify-between flex-row items-center">
        <div className="pt-1 pb-4">
          <div className="prose">
            <SectionHeading className="font-bold">
              Personal Access Tokens <sup className="text-sm">[BETA]</sup>
            </SectionHeading>
            <p>
              Welcome to the Platform Beta! You can create{' '}
              <code>Personal Access Tokens</code> here. <br />
              <a href="/labs/platform_demo">Take a look at this guide</a> to see
              how to use the platform API, and create apps on demand!
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Button
          variant="primary"
          size="mini"
          onClick={() => setIsCreatingNewToken(true)}
        >
          <PlusIcon className="h-4 w-4 mr-1" />
          New access token
        </Button>
        <table className="z-0 w-full flex-1 text-left font-mono text-xs text-gray-500">
          <thead className="sticky top-0 z-20 border-b">
            <tr>
              <th
                className={cn(
                  'z-10 cursor-pointer select-none whitespace-nowrap px-4 py-1',
                )}
              >
                Name
              </th>
              <th
                className={cn(
                  'z-10 cursor-pointer select-none whitespace-nowrap px-4 py-1',
                )}
              >
                Created
              </th>
              <th
                className={cn(
                  'z-10 cursor-pointer select-none whitespace-nowrap px-4 py-1',
                )}
              ></th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {personalAccessTokens.map(({ id, name, created_at }) => (
              <tr key={id} className="group border-b bg-white">
                <td className="whitespace-nowrap px-4 py-1">{name}</td>
                <td className="whitespace-nowrap px-4 py-1">
                  {format(new Date(created_at), 'MMM dd, h:mma')}
                </td>
                <td className="px-4 py-1" style={{}}>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="destructive"
                      size="mini"
                      onClick={() => handleDeleteToken(id)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="h-full"></tr>
          </tbody>
        </table>
        <Dialog
          open={isCreatingNewToken}
          onClose={() => setIsCreatingNewToken(false)}
        >
          <ActionForm className="max-w-2xl">
            <h5 className="flex text-lg font-bold">
              Create personal access token
            </h5>

            <div className="flex flex-col gap-4 mt-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <Label className="font-mono">Nickname</Label>
                </div>
                <div className="flex gap-1 flex-col">
                  <input
                    className="flex w-full flex-1 rounded-sm border-gray-200 bg-white px-3 py-1 placeholder:text-gray-400"
                    placeholder="My default token"
                    value={newPersonalAccessTokenName ?? ''}
                    onChange={(e) =>
                      setNewPersonalAccessTokenName(e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-row items-center justify-end gap-1">
              <div className="flex flex-row items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCreatingNewToken(false)}
                >
                  Close
                </Button>
                <ActionButton
                  type="submit"
                  variant="primary"
                  label="Create"
                  submitLabel="Creating..."
                  errorMessage="Failed to create token."
                  onClick={handleGenerateNewToken}
                />
              </div>
            </div>
          </ActionForm>
        </Dialog>
      </div>
    </div>
  );
}

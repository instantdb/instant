import { useContext, useState } from 'react';
import config from '@/lib/config';
import { jsonMutate } from '@/lib/fetch';
import { TokenContext } from '@/lib/contexts';
import { useAuthedFetch } from '@/lib/auth';
import { InstantApp } from '@/lib/types';
import {
  BlockHeading,
  Button,
  Content,
  Dialog,
  SectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { TrashIcon } from '@heroicons/react/24/solid';
import { errorToast, successToast } from '@/lib/toast';

type TestUser = {
  id: string;
  app_id: string;
  email: string;
  code: string;
  created_at: string;
};

export function TestUsers({ app }: { app: InstantApp }) {
  const token = useContext(TokenContext);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('424242');
  const [isAdding, setIsAdding] = useState(false);
  const [deletingUser, setDeletingUser] = useState<TestUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteDialog = useDialog();

  const fetchResult = useAuthedFetch<{ 'test-users': TestUser[] }>(
    `${config.apiURI}/dash/apps/${app.id}/test_users`,
  );

  const testUsers = fetchResult.data?.['test-users'] || [];

  const handleAdd = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      errorToast('Please enter an email');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      errorToast('Code must be 6 digits');
      return;
    }
    setIsAdding(true);
    try {
      await jsonMutate(`${config.apiURI}/dash/apps/${app.id}/test_users`, {
        body: { email: normalizedEmail, code },
        token,
      });
      setEmail('');
      setCode('424242');
      successToast('Test user added!');
      fetchResult.mutate();
    } catch (e: any) {
      if (e?.body?.type === 'record-not-unique') {
        errorToast('A test user with this email already exists');
      } else {
        errorToast('Failed to add test user');
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      await jsonMutate(`${config.apiURI}/dash/apps/${app.id}/test_users`, {
        body: { id: deletingUser.id },
        token,
        method: 'DELETE',
      });
      successToast('Test user removed!');
      deleteDialog.onClose();
      fetchResult.mutate();
    } catch {
      errorToast('Failed to remove test user');
    } finally {
      setIsDeleting(false);
    }
  };

  const addForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleAdd();
      }}
      className="flex items-center gap-3"
    >
      <div className="grow">
        <TextInput
          type="email"
          placeholder="test@example.com"
          value={email}
          onChange={setEmail}
        />
      </div>
      <span className="shrink-0 text-xs text-gray-400 dark:text-neutral-500">
        signs in with
      </span>
      <div className="w-28 shrink-0">
        <TextInput
          placeholder="123456"
          value={code}
          onChange={setCode}
          inputMode="numeric"
          error={code && !/^\d{6}$/.test(code) ? 'Must be 6 digits' : undefined}
        />
      </div>
      <Button type="submit" loading={isAdding} variant="secondary">
        Add
      </Button>
    </form>
  );

  return (
    <div className="flex flex-col gap-2">
      <BlockHeading className="text-sm font-semibold text-gray-700 dark:text-neutral-300">
        Test users
      </BlockHeading>
      <p className="text-sm text-gray-500 dark:text-neutral-400">
        Static magic codes that never expire, so a test user can sign in with a
        fixed code instead of a real email. Handy for development, automated
        testing, and app store review.
      </p>

      {fetchResult.isLoading ? (
        <div className="text-sm text-gray-400">Loading...</div>
      ) : testUsers.length > 0 ? (
        <div className="divide-y overflow-hidden rounded-sm border bg-gray-50 dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/50">
          {testUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <span className="truncate font-medium">{user.email}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-gray-400 dark:text-neutral-500">
                  signs in with
                </span>
                <span className="rounded-sm bg-gray-100 px-2 py-0.5 font-mono text-sm dark:bg-neutral-700">
                  {user.code}
                </span>
                <button
                  type="button"
                  aria-label="Remove user"
                  title="Remove user"
                  className="cursor-pointer text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400"
                  onClick={() => {
                    setDeletingUser(user);
                    deleteDialog.onOpen();
                  }}
                >
                  <TrashIcon height="1rem" />
                </button>
              </div>
            </div>
          ))}
          <div className="px-4 py-3">{addForm}</div>
        </div>
      ) : (
        addForm
      )}

      <Dialog title="Remove test user" {...deleteDialog}>
        <div className="flex flex-col gap-4">
          <SectionHeading>Remove test user</SectionHeading>
          <Content>
            Remove test user <strong>{deletingUser?.email}</strong>?
          </Content>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={deleteDialog.onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={isDeleting}
              onClick={handleDelete}
            >
              Remove
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

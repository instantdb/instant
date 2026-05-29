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
  const [showAddForm, setShowAddForm] = useState(false);
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
      setShowAddForm(false);
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

  return (
    <div className="flex flex-col gap-2">
      <BlockHeading>Test users</BlockHeading>
      <Content className="text-sm text-gray-500 dark:text-neutral-400">
        Static magic codes that never expire, so a test user can sign in with a
        fixed code instead of a real email. Handy for development, automated
        testing, and app store review.
      </Content>

      {fetchResult.isLoading ? (
        <div className="text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="overflow-hidden rounded-sm border dark:border-neutral-700">
          {testUsers.length > 0 ? (
            <div className="divide-y dark:divide-neutral-700">
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
                    <span className="rounded-sm bg-gray-100 px-2 py-0.5 font-mono text-sm dark:bg-neutral-800">
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
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-neutral-400">
              No test users yet.
            </div>
          )}

          <div className="border-t p-3 dark:border-neutral-700">
            {showAddForm ? (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <TextInput
                    label="Email"
                    placeholder="test@example.com"
                    value={email}
                    onChange={(v) => setEmail(v)}
                    autoFocus
                  />
                </div>
                <div className="w-36">
                  <TextInput
                    label="Magic code"
                    placeholder="123456"
                    value={code}
                    onChange={(v) => setCode(v)}
                    error={
                      code && !/^\d{6}$/.test(code)
                        ? 'Must be 6 digits'
                        : undefined
                    }
                  />
                </div>
                <Button
                  onClick={handleAdd}
                  loading={isAdding}
                  disabled={!email || !/^\d{6}$/.test(code)}
                  variant="primary"
                >
                  Add
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setEmail('');
                    setCode('424242');
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setShowAddForm(true)}>
                Add a test user
              </Button>
            )}
          </div>
        </div>
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

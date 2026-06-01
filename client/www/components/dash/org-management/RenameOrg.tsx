import { Button, SectionHeading, TextInput } from '@/components/ui';
import { useContext, useState } from 'react';
import { useFetchedDash } from '../MainDashLayout';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { useReadyRouter } from '@/components/clientOnlyPage';

export const RenameOrg = () => {
  const dash = useFetchedDash();
  const token = useContext(TokenContext);
  const router = useReadyRouter();
  const currentTitle =
    dash.data.workspace.type === 'org' ? dash.data.workspace.org.title : '';
  const [value, setValue] = useState(currentTitle);

  const submit = async () => {
    if (dash.data.workspace.type !== 'org') {
      throw new Error('Workspace is not an organization');
    }
    if (!value) {
      throw new Error('New name cannot be empty');
    }
    dash.optimisticUpdateWorkspace(
      await jsonFetch(
        `${config.apiURI}/dash/orgs/${dash.data.workspace.id}/rename`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ title: value }),
        },
      ),
      (prev) => {
        if (prev.type === 'personal') {
          return;
        }
        prev.org.title = value;
        return prev;
      },
    );

    // Refetch the main dash so it updates there too
    dash.mutate();
  };

  if (dash.data.workspace.type === 'personal') {
    router.replace('/dash');
    return;
  }

  return (
    <form
      className="flex flex-col gap-3 pt-6"
      onSubmit={async (e) => {
        e.preventDefault();
        await submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <SectionHeading>Rename organization</SectionHeading>
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          This name is shown across your dashboard.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end">
        <TextInput
          value={value}
          label="Name"
          className="w-full sm:max-w-xs"
          placeholder="Enter a new organization name"
          onChange={(e) => setValue(e)}
        />
        <Button
          disabled={!value || value === currentTitle}
          variant="primary"
          type="submit"
        >
          Rename
        </Button>
      </div>
    </form>
  );
};

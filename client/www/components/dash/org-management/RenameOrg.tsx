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
  const [value, setValue] = useState('');
  const router = useReadyRouter();

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
      className="pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await submit();
      }}
    >
      <SectionHeading className="pb-2">Rename Organization</SectionHeading>
      <div className="flex flex-col items-start md:flex-row md:items-end md:justify-stretch md:gap-2">
        <TextInput
          value={value}
          label="New Name"
          className="min-w-[300px]"
          placeholder="Enter new organization name"
          onChange={(e) => setValue(e)}
        />

        <div className="flex justify-end gap-2 pt-2 md:pt-4">
          <Button
            disabled={!value || value === dash.data.workspace.org.title}
            variant="secondary"
            type="submit"
          >
            Rename
          </Button>
        </div>
      </div>
    </form>
  );
};

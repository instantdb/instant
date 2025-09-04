import {
  Button,
  Dialog,
  SectionHeading,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { PencilIcon } from '@heroicons/react/24/solid';
import { useContext, useState } from 'react';
import { useFetchedDash } from '../MainDashLayout';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';

export const RenameOrg = () => {
  const dash = useFetchedDash();
  const token = useContext(TokenContext);
  const [value, setValue] = useState('');

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
  };

  if (dash.data.workspace.type === 'personal') {
    throw new Error('Personal workspaces cannot be renamed'); // should never happen
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
      <div className="flex gap-2 items-end justify-stretch">
        <TextInput
          value={value}
          label="New Name"
          className="min-w-[300px]"
          placeholder="Enter new organization name"
          onChange={(e) => setValue(e)}
        />

        <div className="flex justify-end gap-2 pt-4">
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

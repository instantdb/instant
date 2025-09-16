import {
  Button,
  Dialog,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { useContext, useState } from 'react';
import { useFetchedDash } from '../MainDashLayout';
import { jsonFetch } from '@/lib/fetch';
import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';

export const CreateOrgModal = () => {
  const dash = useFetchedDash();
  const dialog = useDialog();
  const token = useContext(TokenContext);
  const [value, setValue] = useState('');

  const submit = async () => {
    if (!value) {
      throw new Error('New name cannot be empty');
    }
    dash.optimisticUpdate(
      await jsonFetch(`${config.apiURI}/dash/orgs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: value }),
      }),
      (prev) => {
        if (!prev.orgs) return prev;
        prev.orgs.push({
          id: 'new',
          title: value,
          created_at: new Date().toISOString(),
          role: 'owner',
        });
        return prev;
      },
    );
  };

  return (
    <>
      <Button
        onClick={() => dialog.onOpen()}
        variant="secondary"
        className="hover:bg-gray-200 text-left w-full px-2"
      >
        Create Org
      </Button>
      <Dialog {...dialog}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await submit();
            dialog.onClose();
          }}
        >
          <SubsectionHeading className="pb-4">
            Create Organization
          </SubsectionHeading>
          <TextInput
            value={value}
            label="Name"
            placeholder="My Organization"
            onChange={(e) => setValue(e)}
          />
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              onClick={() => dialog.onClose()}
              variant="subtle"
            >
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
};

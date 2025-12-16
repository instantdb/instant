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
import { useReadyRouter } from '@/components/clientOnlyPage';
import { infoToast, successToast } from '@/lib/toast';

export const CreateOrgModal = ({
  dialog,
}: {
  dialog: ReturnType<typeof useDialog>;
}) => {
  const dash = useFetchedDash();
  const token = useContext(TokenContext);
  const [errorText, setErrorText] = useState<null | string>(null);
  const [value, setValue] = useState('');
  const router = useReadyRouter();

  const submit = async () => {
    if (!value.trim()) {
      setErrorText('Organization name can not be empty');
      return;
    }
    const createdOrg = (await dash.optimisticUpdate(
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
          paid: false,
          id: 'new',
          title: value,
          created_at: new Date().toISOString(),
          role: 'owner',
        });
        return prev;
      },
    )) as {
      org: {
        // more fields
        id: string;
      };
    };

    dash.setWorkspace(createdOrg.org.id);
    router.push('/dash/org?org=' + createdOrg.org.id);

    dialog.onClose();
  };

  return (
    <>
      <Dialog title="Create Org" {...dialog}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await submit();
          }}
        >
          <SubsectionHeading className="pb-4">
            Create Organization
          </SubsectionHeading>
          <TextInput
            error={errorText}
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

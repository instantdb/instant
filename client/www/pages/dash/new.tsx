import { NextPageWithLayout } from '../_app';
import { asClientOnlyPage, ClientOnly } from '@/components/clientOnlyPage';
import {
  MainDashLayout,
  useFetchedDash,
} from '@/components/dash/MainDashLayout';
import {
  ActionForm,
  Button,
  Content,
  ScreenHeading,
  TextInput,
} from '@/components/ui';
import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { InstantApp } from '@/lib/types';
import { useRouter } from 'next/router';
import { ReactElement, useContext, useState } from 'react';
import { v4 } from 'uuid';

const Page: NextPageWithLayout = asClientOnlyPage(NewApp);

function NewApp() {
  const [name, setName] = useState('');
  const dashResponse = useFetchedDash();
  const token = useContext(TokenContext);
  const router = useRouter();

  function onCreateApp(r: { name: string }) {
    const orgId =
      dashResponse.data.currentWorkspaceId === 'personal'
        ? undefined
        : dashResponse.data.currentWorkspaceId;
    const app: InstantApp & {
      org_id?: string | null | undefined;
    } = {
      id: v4(),
      pro: false,
      title: r.name.trim(),
      org_id: orgId,
      admin_token: v4(),
      created_at: new Date().toISOString(),
      rules: null,
      members: [],
      invites: [],
      user_app_role: 'owner',
      magic_code_email_template: null,
      org: null,
    };

    const promise = createApp(token, app);
    dashResponse.addNewAppOptimistically(promise, app);
    router.replace(
      `/dash?app=${app.id}&t=home&s=main&org=${dashResponse.data.currentWorkspaceId}`,
    );
  }
  return (
    <>
      <div className="w-full h-full grid place-items-center">
        <ActionForm className="flex  max-w-md flex-col gap-4">
          <div className="mb-2 flex justify-center text-4xl">🔥</div>
          <ScreenHeading className="text-center">
            Time for a new app?
          </ScreenHeading>
          {dashResponse.data.workspace.type === 'org' && (
            <Content className="w-full">
              This app will be created in the{' '}
              <strong>{dashResponse.data.workspace.org.title}</strong>{' '}
              organization.
            </Content>
          )}
          <Content>What would you like to call it?</Content>
          <TextInput
            autoFocus
            placeholder="Name your app"
            value={name}
            onChange={(n) => setName(n)}
          />
          <Button
            type="submit"
            disabled={name.trim().length === 0}
            onClick={() => onCreateApp({ name })}
          >
            Let's go!
          </Button>
        </ActionForm>
      </div>
    </>
  );
}

Page.getLayout = function getLayout(page: ReactElement) {
  return (
    <ClientOnly>
      <MainDashLayout>{page}</MainDashLayout>
    </ClientOnly>
  );
};

export default Page;

export function createApp(
  token: string,
  toCreate: {
    id: string;
    title: string;
    admin_token: string;
    org_id?: string | null | undefined;
  },
) {
  return jsonFetch(`${config.apiURI}/dash/apps`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(toCreate),
  });
}

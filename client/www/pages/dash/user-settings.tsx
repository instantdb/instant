import {
  MainDashLayout,
  useFetchedDash,
} from '@/components/dash/MainDashLayout';
import { NextPageWithLayout } from '../_app';
import { ClientOnly } from '@/components/clientOnlyPage';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import { Button, NavTabBar, ScreenHeading, TabItem } from '@/components/ui';
import PersonalAccessTokensTab from '@/components/dash/PersonalAccessTokensScreen';
import OAuthAppsTab from '@/components/dash/AuthorizedOAuthAppsScreen';
import { useRouter } from 'next/router';
import { BackToAppsButton } from '@/components/dash/BackToAppsButton';
import { Invites } from '@/components/dash/Invites';
import Head from 'next/head';

type UserSettingsTab = 'token' | 'oauth' | 'invites';

const UserSettingsPage: NextPageWithLayout = () => {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringEnum<UserSettingsTab>([
      'token',
      'oauth',
      'invites',
    ]).withDefault('token'),
  );
  const dashResponse = useFetchedDash();
  const router = useRouter();

  const tabs: TabItem[] = [
    { id: 'token', label: 'Access Tokens' },
    { id: 'oauth', label: 'OAuth Apps' },
    { id: 'invites', label: 'Invites' },
  ];

  return (
    <>
      <BackToAppsButton />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 dark:text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <ScreenHeading>User Settings</ScreenHeading>
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              {dashResponse.data.user.email}
            </p>
          </div>
          <Button onClick={() => router.push('/logout')} variant="secondary">
            Log Out
          </Button>
        </div>
        <NavTabBar
          className="border-transparent"
          tabs={tabs}
          selectedId={tab}
          onSelect={(t) => setTab(t.id as UserSettingsTab)}
        />
        {tab === 'token' ? (
          <PersonalAccessTokensTab />
        ) : tab === 'oauth' ? (
          <OAuthAppsTab />
        ) : (
          <Invites />
        )}
      </div>
    </>
  );
};

UserSettingsPage.getLayout = (page) => {
  return (
    <ClientOnly>
      <Head>
        <title>User Settings</title>
      </Head>
      <MainDashLayout className="bg-gray-100">{page}</MainDashLayout>
    </ClientOnly>
  );
};

export default UserSettingsPage;

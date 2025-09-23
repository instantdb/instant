import { ClientOnly, useReadyRouter } from '@/components/clientOnlyPage';
import { BackToAppsButton } from '@/components/dash/BackToAppsButton';
import {
  MainDashLayout,
  useFetchedDash,
} from '@/components/dash/MainDashLayout';
import { Members } from '@/components/dash/org-management/Members';
import { OrgBilling } from '@/components/dash/org-management/OrgBilling';
import { OrgManagePage } from '@/components/dash/org-management/OrgManagePage';
import { Badge, NavTabBar, SmallCopyable } from '@/components/ui';
import { useAuthedFetch } from '@/lib/auth';
import config from '@/lib/config';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import Head from 'next/head';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import { ReactElement } from 'react';
import { isMinRole, Role } from '.';
import { NextPageWithLayout } from '../_app';
import { capitalize } from 'lodash';
import useLocalStorage from '@/lib/hooks/useLocalStorage';

const OrgSettingsPage: NextPageWithLayout = () => {
  const fetchedDash = useFetchedDash();
  const router = useReadyRouter();

  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringEnum(['members', 'billing', 'manage']).withDefault('members'),
  );
  const org = fetchedDash.data.workspace;

  const [hideOrgId, setHideOrgId] = useLocalStorage('hide_org_id', false);

  const billingInfo = useAuthedFetch(
    `${config.apiURI}/dash/orgs/${fetchedDash.data.currentWorkspaceId}/billing`,
  );

  if (
    fetchedDash.data.currentWorkspaceId === 'personal' ||
    org.type === 'personal'
  ) {
    router.replace('/dash');
    return;
  }

  const myRole = org.org.role as Role;

  if (!myRole) {
    throw new Error('User not found in organization');
  }

  let tabs = [{ id: 'members', label: 'Members' }];
  if (isMinRole('collaborator', myRole)) {
    tabs.push({ id: 'billing', label: 'Usage & Billing' });
  }
  if (isMinRole('admin', myRole)) {
    tabs.push({ id: 'manage', label: 'Manage' });
  }

  return (
    <>
      <BackToAppsButton />
      <div className="bg-gray-50 dark:bg-neutral-800">
        <div className="flex md:flex-row flex-col dark:border-b-neutral-800 border-b border-b-gray-300 justify-between md:gap-4 py-2 px-3">
          <div className="flex gap-2 items-center">
            <h2 className="font-mono md:text-xl font-bold">
              <div className="flex gap-4 items-center">
                <BuildingOffice2Icon className="opacity-40" width={20} />
                <div className="text-lg font-bold">{org.org.title}</div>
              </div>
            </h2>
            {billingInfo.data && (
              <Badge>{billingInfo.data['subscription-name']} Plan</Badge>
            )}
          </div>
          <SmallCopyable
            size="normal"
            label="Org ID"
            value={org.org.id}
            hideValue={hideOrgId}
            onChangeHideValue={() => {
              setHideOrgId(!hideOrgId);
            }}
          />
        </div>
      </div>

      <div className="overflow-scroll w-full px-4 max-w-[680px] lg:px-12 mx-auto pt-6">
        <NavTabBar
          className="border-transparent"
          tabs={tabs}
          selectedId={tab}
          onSelect={(t) => setTab(t.id as 'members' | 'billing' | 'manage')}
        />
        {tab === 'members' && <Members />}
        {tab === 'manage' && <OrgManagePage />}
        {tab === 'billing' && <OrgBilling />}
      </div>
    </>
  );
};

OrgSettingsPage.getLayout = function getLayout(page: ReactElement) {
  return (
    <ClientOnly>
      <Head>
        <title>Instant - Organization Settings</title>
      </Head>
      <MainDashLayout className="bg-gray-100">{page}</MainDashLayout>
    </ClientOnly>
  );
};

export default OrgSettingsPage;

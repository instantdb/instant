import { useState } from 'react';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import {
  ActionForm,
  Badge,
  Button,
  Content,
  NavTabBar,
  ScreenHeading,
  SmallCopyable,
  TabItem,
  TextInput,
} from '@/components/ui';
import {
  BackToAppsLink,
  DashEmptyState,
  DashPage,
  DashPanel,
  DashPanelHeader,
  DashRow,
  MockTopBar,
} from '../_shared';
import { OrgSubState } from './index';

const MOCK_ORG = {
  id: '01HFAKEORGIDX1234567890ABCD',
  title: 'my-new-org',
  plan: 'Free',
};

const TABS: TabItem[] = [
  { id: 'members', label: 'Members' },
  { id: 'billing', label: 'Usage & Billing' },
  { id: 'manage', label: 'Manage' },
];

function OrgHeader() {
  return (
    <div className="bg-white dark:bg-neutral-950">
      <div className="flex flex-col justify-between border-b border-gray-200 px-4 py-3 md:flex-row md:items-center md:gap-4 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold md:text-xl">
            <div className="flex items-center gap-4">
              <BuildingOffice2Icon className="opacity-40" width={20} />
              <div className="text-xl font-semibold">{MOCK_ORG.title}</div>
            </div>
          </h2>
          <Badge>{MOCK_ORG.plan} Plan</Badge>
        </div>
        <SmallCopyable
          size="normal"
          label="Org ID"
          value={MOCK_ORG.id}
          hideValue={false}
          onChangeHideValue={() => {}}
        />
      </div>
    </div>
  );
}

function MembersTab() {
  const myEmail = 'sto.pa@instantdb.com';
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <DashPanel>
        <DashPanelHeader
          title="Current members"
          action={<Button size="mini">Invite</Button>}
        />
        <DashRow
          label={
            <span className="flex items-center gap-2">
              {myEmail}
              <Badge>Me</Badge>
            </span>
          }
          value="Owner"
        />
        <DashRow label="teammate@example.com" value="Admin" />
      </DashPanel>
      <DashPanel>
        <DashPanelHeader title="Pending invites" />
        <DashEmptyState
          title="No pending invites"
          description="Invited teammates will appear here until they accept."
        />
      </DashPanel>
    </div>
  );
}

function BillingTab() {
  return (
    <DashPanel>
      <DashPanelHeader
        title="Billing"
        description={`You're on the ${MOCK_ORG.plan} plan.`}
        action={<Badge>{MOCK_ORG.plan}</Badge>}
      />
      <DashEmptyState
        title="Usage will appear here"
        description="Storage, bandwidth, and invoices are grouped here for organization billing."
      />
    </DashPanel>
  );
}

function ManageTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DashPanel>
        <DashPanelHeader
          title="Rename organization"
          description="Update the display name shown in the top bar and member views."
        />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <TextInput
            label="Name"
            size="large"
            value={MOCK_ORG.title}
            onChange={() => {}}
            placeholder="Organization name"
          />
          <Button variant="primary" size="large">
            Save
          </Button>
        </div>
      </DashPanel>
      <DashPanel>
        <DashPanelHeader
          title="Delete organization"
          description="Permanently remove all apps, members, and billing history."
        />
        <Button variant="destructive" size="mini">
          Delete organization
        </Button>
      </DashPanel>
    </div>
  );
}

function EmptyOrgNewApp() {
  const [name, setName] = useState('');
  return (
    <div className="my-auto grid h-full w-full place-items-center p-6">
      <ActionForm className="flex w-full max-w-[660px] flex-col gap-5">
        <ScreenHeading className="text-center">
          Time for a new app?
        </ScreenHeading>
        <Content className="w-full">
          This app will be created in the{' '}
          <strong className="dark:text-white">{MOCK_ORG.title}</strong>{' '}
          organization.
        </Content>
        <Content>What would you like to call it?</Content>
        <TextInput
          size="jumbo"
          placeholder="Name your app"
          value={name}
          onChange={(n) => setName(n)}
        />
        <Button size="jumbo" type="submit" disabled={name.trim().length === 0}>
          Let's go!
        </Button>
        <Button type="button" variant="secondary" size="large">
          Nevermind
        </Button>
      </ActionForm>
    </div>
  );
}

export function Current({ sub }: { sub: OrgSubState }) {
  if (sub === 'empty') {
    return (
      <div className="flex min-h-screen flex-col bg-[#fbfaf8] dark:bg-neutral-950 dark:text-white">
        <MockTopBar account={{ kind: 'org', title: MOCK_ORG.title }} />
        <div className="flex flex-1">
          <EmptyOrgNewApp />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col bg-[#fbfaf8] dark:bg-neutral-950 dark:text-white">
      <MockTopBar
        account={{ kind: 'org', title: MOCK_ORG.title }}
        leftExtra={<BackToAppsLink />}
      />
      <OrgHeader />
      <DashPage size="default">
        <NavTabBar
          className="border-transparent"
          tabs={TABS}
          selectedId={sub}
          onSelect={() => {
            /* sidebar drives the active tab */
          }}
        />
        {sub === 'members' && <MembersTab />}
        {sub === 'billing' && <BillingTab />}
        {sub === 'manage' && <ManageTab />}
      </DashPage>
    </div>
  );
}

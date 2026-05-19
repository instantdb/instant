import { useState } from 'react';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';
import {
  ActionForm,
  Badge,
  Button,
  Content,
  Label,
  NavTabBar,
  ScreenHeading,
  SectionHeading,
  SmallCopyable,
  SubsectionHeading,
  TabItem,
  TextInput,
} from '@/components/ui';
import { BackToAppsLink, MockTopBar } from '../_shared';
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
    <div className="bg-gray-50 dark:bg-neutral-800">
      <div className="flex flex-col justify-between border-b border-b-gray-300 px-3 py-2 md:flex-row md:gap-4 dark:border-b-neutral-800">
        <div className="flex items-center gap-2">
          <h2 className="font-mono font-bold md:text-xl">
            <div className="flex items-center gap-4">
              <BuildingOffice2Icon className="opacity-40" width={20} />
              <div className="text-lg font-bold">{MOCK_ORG.title}</div>
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
    <div>
      <div className="flex items-end justify-between py-2">
        <SubsectionHeading>Current Members</SubsectionHeading>
        <Button size="mini">Invite</Button>
      </div>
      <div className="divide-y rounded-xs border bg-white dark:divide-neutral-700 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex w-full items-center justify-between gap-2 rounded-xs p-2">
          <div className="flex items-center gap-3">
            {myEmail}
            <Badge>Me</Badge>
          </div>
          <div className="text-sm">Owner</div>
        </div>
        <div className="flex w-full items-center justify-between gap-2 rounded-xs p-2">
          <div className="flex items-center gap-3">teammate@example.com</div>
          <div className="text-sm">Admin</div>
        </div>
      </div>
      <div className="mt-6">
        <SubsectionHeading>Pending Invites</SubsectionHeading>
        <div className="w-full py-8 text-center text-sm opacity-50">
          No pending invites
        </div>
      </div>
    </div>
  );
}

function BillingTab() {
  return (
    <div>
      <SectionHeading className="pt-8 pb-2">Billing</SectionHeading>
      <Content className="dark:text-neutral-400">
        <p>You're on the {MOCK_ORG.plan} Plan.</p>
      </Content>
      <div className="mt-4 rounded-sm border bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="text-sm text-gray-500 dark:text-neutral-400">
          Usage and billing details will appear here.
        </div>
      </div>
    </div>
  );
}

function ManageTab() {
  return (
    <div className="flex flex-col gap-8 pt-6">
      <div>
        <SubsectionHeading>Rename organization</SubsectionHeading>
        <Content className="dark:text-neutral-400">
          <p>Update the display name shown in the top bar and member views.</p>
        </Content>
        <div className="mt-3 flex max-w-md flex-col gap-2">
          <Label>Name</Label>
          <TextInput
            value={MOCK_ORG.title}
            onChange={() => {}}
            placeholder="Organization name"
          />
          <div>
            <Button variant="primary" size="mini">
              Save
            </Button>
          </div>
        </div>
      </div>
      <div>
        <SubsectionHeading>Delete organization</SubsectionHeading>
        <Content className="dark:text-neutral-400">
          <p>
            Deleting this org will permanently remove all of its apps, members,
            and billing history. This cannot be undone.
          </p>
        </Content>
        <div className="mt-3">
          <Button variant="destructive" size="mini">
            Delete organization
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyOrgNewApp() {
  const [name, setName] = useState('');
  return (
    <div className="my-auto grid h-full w-full place-items-center">
      <ActionForm className="flex max-w-md flex-col gap-4">
        <div className="mb-2 flex justify-center text-4xl">🔥</div>
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
          placeholder="Name your app"
          value={name}
          onChange={(n) => setName(n)}
        />
        <Button type="submit" disabled={name.trim().length === 0}>
          Let's go!
        </Button>
        <Button type="button" variant="secondary">
          Nevermind
        </Button>
      </ActionForm>
    </div>
  );
}

export function Current({ sub }: { sub: OrgSubState }) {
  if (sub === 'empty') {
    return (
      <div className="flex min-h-screen flex-col bg-white dark:bg-neutral-900 dark:text-white">
        <MockTopBar account={{ kind: 'org', title: MOCK_ORG.title }} />
        <div className="flex flex-1">
          <EmptyOrgNewApp />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen flex-col bg-gray-100 dark:bg-neutral-900 dark:text-white">
      <MockTopBar
        account={{ kind: 'org', title: MOCK_ORG.title }}
        leftExtra={<BackToAppsLink />}
      />
      <OrgHeader />
      <div className="mx-auto w-full max-w-[680px] overflow-scroll px-4 pt-6 lg:px-12">
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
      </div>
    </div>
  );
}

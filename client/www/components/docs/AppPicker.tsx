'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Select } from '@/components/ui';

type App = { id: string; title: string };
type Org = { id: string; title: string };

function titleComparator(a: { title: string }, b: { title: string }) {
  return a.title.localeCompare(b.title);
}

export function AppPicker({
  isReady,
  apps,
  selectedAppData,
  updateSelectedAppId,
  workspaceId,
  allOrgs,
}: {
  isReady: boolean;
  apps: App[];
  selectedAppData: App | null;
  updateSelectedAppId: (id: string) => void;
  workspaceId: string;
  allOrgs: Org[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  const isLoggedOut = isReady && apps.length === 0 && allOrgs.length === 0;
  const hasApps = isReady && apps.length > 0;
  const hasOrgs = isReady && allOrgs.length > 0;

  const appOptions = apps.toSorted(titleComparator).map((app) => ({
    label: app.title,
    value: app.id,
  }));

  const currentWorkspaceName =
    workspaceId === 'personal'
      ? 'Personal'
      : allOrgs.find((org) => org.id === workspaceId)?.title || workspaceId;

  const workspaceOptions: {
    label: string;
    value: string;
    disabled?: boolean;
  }[] = [];
  if (workspaceId !== 'personal') {
    workspaceOptions.push({ label: 'Personal', value: 'org:personal' });
  }
  allOrgs.forEach((org) => {
    if (org.id !== workspaceId) {
      workspaceOptions.push({ label: org.title, value: `org:${org.id}` });
    }
  });

  function onSelectAppId(option?: { value: string }) {
    const value = option?.value;
    if (!value) return;
    updateSelectedAppId(value);
  }

  function onSelectWorkspace(option?: { value: string }) {
    const value = option?.value;
    if (!value) return;
    const orgId = value.substring(4); // strip "org:" prefix
    const newParams = new URLSearchParams(window.location.search);
    newParams.delete('org');
    if (orgId !== 'personal') {
      newParams.set('org', orgId);
    }
    const queryString = newParams.toString();
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`);
  }

  return (
    <div className="bg-opacity-40 mb-6 flex flex-col gap-2 border bg-white p-4">
      <div className="flex min-h-9 items-center justify-between">
        <h4 className="font-bold">Pick your app</h4>
        {hasOrgs && workspaceOptions.length > 0 && (
          <Select
            className="max-w-[10rem]"
            value={`org:${workspaceId}`}
            visibleValue={
              <span className="text-xs text-gray-500">
                {currentWorkspaceName}
              </span>
            }
            options={workspaceOptions}
            onChange={onSelectWorkspace}
          />
        )}
      </div>
      <p className="text-sm text-gray-600">
        The examples below will be updated with your app ID.
      </p>
      {/* Action area — all states use h-9 rounded-sm border to match Select trigger */}
      {!isReady ? (
        <div className="h-9 w-fit min-w-[10rem] animate-pulse rounded-sm border border-gray-300/80 bg-gray-50 shadow-xs" />
      ) : isLoggedOut ? (
        <Link
          href="/dash"
          className="flex h-9 w-fit items-center gap-1 rounded-sm border border-gray-300/80 px-3 text-sm text-gray-500 shadow-xs transition-colors hover:border-gray-400 hover:text-gray-700"
        >
          Sign in to get started &rarr;
        </Link>
      ) : !hasApps ? (
        <Link
          href="/dash"
          className="flex h-9 w-fit items-center gap-1 rounded-sm border border-gray-300/80 px-3 text-sm text-gray-500 shadow-xs transition-colors hover:border-gray-400 hover:text-gray-700"
        >
          No apps yet &mdash; create one
        </Link>
      ) : (
        <Select
          value={selectedAppData?.id}
          options={appOptions}
          onChange={onSelectAppId}
        />
      )}
    </div>
  );
}

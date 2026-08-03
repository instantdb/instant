import { useMemo } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

import config from '@/lib/config';
import { useAuthedFetch } from '@/lib/auth';
import { InstantApp, InstantAppBackup } from '@/lib/types';

import { Button, Content, SectionHeading, useDialog } from '@/components/ui';
import {
  ErrorMessage,
  Loading,
  formatTimestamp,
} from '@/components/dash/shared';
import { CopyableText } from '@/components/dash/Webhooks';
import { DownloadDialog } from '@/components/dash/BackupDownloadDialog';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/components/ui/item';

function BackupRow({
  app,
  backup,
}: {
  app: InstantApp;
  backup: InstantAppBackup;
}) {
  const downloadDialog = useDialog();

  return (
    <Item
      variant="outline"
      className="bg-white dark:border-neutral-700 dark:bg-neutral-800"
    >
      <ItemContent>
        <ItemTitle>{formatTimestamp(backup.backup_at)}</ItemTitle>
        {backup.description ? (
          <ItemDescription>{backup.description}</ItemDescription>
        ) : null}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-neutral-500">
          {backup.expires_at ? (
            <>
              <dt>Expires</dt>
              <dd>{formatTimestamp(backup.expires_at)}</dd>
            </>
          ) : null}
          <dt>ID</dt>
          <dd>
            <CopyableText value={backup.id} className="font-mono break-all" />
          </dd>
        </dl>
      </ItemContent>
      <ItemActions>
        <Button variant="secondary" size="mini" onClick={downloadDialog.onOpen}>
          <ArrowDownTrayIcon width={14} /> Download
        </Button>
      </ItemActions>
      <DownloadDialog app={app} backup={backup} dialog={downloadDialog} />
    </Item>
  );
}

export function Backups({ app }: { app: InstantApp }) {
  const backupsRes = useAuthedFetch<{
    backups: InstantAppBackup[];
  }>(`${config.apiURI}/dash/apps/${app.id}/backups`);

  const backups = useMemo(
    () =>
      (backupsRes.data?.backups ?? []).filter(
        (backup) =>
          backup.expires_at && new Date(backup.expires_at) > new Date(),
      ),
    [backupsRes.data?.backups],
  );

  if (backupsRes.isLoading) return <Loading />;
  if (backupsRes.error) {
    return <ErrorMessage>Failed to load backups.</ErrorMessage>;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <SectionHeading>Backups</SectionHeading>
        <Content className="text-sm text-gray-500 dark:text-neutral-500">
          Point-in-time snapshots of your app's data.
        </Content>
      </div>

      {backups.length === 0 ? (
        <div className="rounded-sm border bg-gray-50 p-8 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-500">
          No backups yet.
        </div>
      ) : (
        <ItemGroup className="gap-2">
          {backups.map((b) => (
            <BackupRow key={b.id} app={app} backup={b} />
          ))}
        </ItemGroup>
      )}
    </div>
  );
}

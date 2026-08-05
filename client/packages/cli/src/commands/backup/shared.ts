import chalk from 'chalk';
import { Effect } from 'effect';
import type { InstantAppBackup } from '@instantdb/platform';

import { PlatformApiError } from '../../context/platformApi.ts';
import { buildBackupsManager } from '../../lib/backups.ts';

export const activeBackups = (
  backups: readonly InstantAppBackup[],
  now = Date.now(),
) =>
  backups
    .filter((backup) => {
      if (!backup.expires_at) return false;
      const expiresAt = new Date(backup.expires_at).valueOf();
      return Number.isFinite(expiresAt) && expiresAt > now;
    })
    .sort(
      (a, b) =>
        new Date(b.backup_at).valueOf() - new Date(a.backup_at).valueOf(),
    );

export const backupDataSize = (backup: InstantAppBackup) => {
  const databaseSize = backup.uncompressed_size ?? backup.db_size;
  if (databaseSize == null && backup.files_size == null) return null;
  return (databaseSize ?? 0) + (backup.files_size ?? 0);
};

export const formatBytes = (bytes: number | null) => {
  if (bytes == null) return 'size unknown';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1000;
    unit++;
  } while (value >= 1000 && unit < units.length - 1);
  const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unit]}`;
};

export const formatBackupTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf()) ? timestamp : date.toLocaleString();
};

export const terminalText = (value: string, maxLength = 160) => {
  const safe = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '�');
  return safe.length > maxLength ? `${safe.slice(0, maxLength - 1)}…` : safe;
};

export const backupLabel = (backup: InstantAppBackup) =>
  [
    `${formatBackupTime(backup.backup_at)} · ${formatBytes(backupDataSize(backup))}`,
    backup.description
      ? chalk.dim(`  ${terminalText(backup.description)}`)
      : null,
    chalk.dim(
      `  expires ${formatBackupTime(backup.expires_at!)} · ${backup.id}`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

export const loadActiveBackups = (command: 'list' | 'download') =>
  Effect.gen(function* () {
    const { appId, manager } = yield* buildBackupsManager(command);
    const backups = yield* Effect.tryPromise({
      try: (signal) => manager.list(appId, signal),
      catch: (cause) =>
        new PlatformApiError({
          message: 'Could not list backups',
          cause,
        }),
    });
    return { appId, manager, backups: activeBackups(backups) };
  });

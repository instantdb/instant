import chalk from 'chalk';
import { Effect } from 'effect';
import { formatFileSize, type AppBackup } from '@instantdb/platform';
import type { backupListDef, OptsFromCommand } from '../../index.ts';
import { useBackupsManager } from '../../lib/backups.ts';

export const formatBackupDate = (date: Date) =>
  `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;

// Backup descriptions are user-controlled text headed for the terminal;
// strip control characters so a crafted value can't inject escape sequences.
export const stripControlChars = (s: string) => s.replace(/\p{Cc}/gu, '');

export const renderBackup = (backup: AppBackup) =>
  Effect.gen(function* () {
    yield* Effect.log(chalk.cyan(formatBackupDate(backup.backupAt)));
    yield* Effect.log(`  ID: ${backup.id}`);
    if (backup.description) {
      yield* Effect.log(
        `  Description: ${stripControlChars(backup.description)}`,
      );
    }
    if (backup.dbSize != null) {
      yield* Effect.log(`  Database size: ${formatFileSize(backup.dbSize)}`);
    }
    if (backup.filesSize != null) {
      yield* Effect.log(
        `  Storage files size: ${formatFileSize(backup.filesSize)}`,
      );
    }
    if (backup.expiresAt) {
      yield* Effect.log(`  Expires: ${formatBackupDate(backup.expiresAt)}`);
    }
  });

export const backupListCmd = Effect.fn(function* (
  opts: OptsFromCommand<typeof backupListDef>,
) {
  const backups = yield* useBackupsManager(
    (m) => m.list(),
    'Error listing backups',
  );

  if (opts.json) {
    yield* Effect.log(JSON.stringify(backups, null, 2));
    return;
  }

  if (backups.length === 0) {
    yield* Effect.log('No backups yet.');
    return;
  }

  for (const backup of backups) {
    yield* renderBackup(backup);
  }
});

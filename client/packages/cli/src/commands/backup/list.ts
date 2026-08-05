import chalk from 'chalk';
import { Effect } from 'effect';
import type { AppBackup } from '@instantdb/platform';
import type { backupListDef, OptsFromCommand } from '../../index.ts';
import { useBackupsManager } from '../../lib/backups.ts';

export const formatBackupDate = (date: Date) =>
  `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;

export function formatBytes(n: number): string {
  // Decimal (1000-based) units with SI labels, to match how macOS/Finder
  // reports file sizes.
  if (n < 1000) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  let v = n;
  do {
    v /= 1000;
    i++;
  } while (v >= 1000 && i < units.length - 1);
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export const renderBackup = (backup: AppBackup) =>
  Effect.gen(function* () {
    yield* Effect.log(chalk.cyan(formatBackupDate(backup.backupAt)));
    yield* Effect.log(`  ID: ${backup.id}`);
    if (backup.description) {
      yield* Effect.log(`  Description: ${backup.description}`);
    }
    if (backup.dbSize != null) {
      yield* Effect.log(`  Database size: ${formatBytes(backup.dbSize)}`);
    }
    if (backup.filesSize != null) {
      yield* Effect.log(
        `  Storage files size: ${formatBytes(backup.filesSize)}`,
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

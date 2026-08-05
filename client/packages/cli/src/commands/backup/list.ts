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

const formatExpiry = (expiresAt: Date): string => {
  const hours = Math.round((expiresAt.getTime() - Date.now()) / 3_600_000);
  if (hours <= 0) return 'expired';
  if (hours < 48) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
};

// One aligned row per backup, newest first, the way backup CLIs
// conventionally render listings. Dates are UTC (noted in the header) and
// expiry is relative; `--json` carries the precise values.
const renderBackupsTable = (backups: AppBackup[]) =>
  Effect.gen(function* () {
    const header = [
      'BACKUP (UTC)',
      'DB SIZE',
      'STORAGE',
      'EXPIRES',
      'ID',
      'DESCRIPTION',
    ];
    const rows = backups.map((backup) => [
      formatBackupDate(backup.backupAt).replace(' UTC', ''),
      backup.dbSize != null ? formatFileSize(backup.dbSize) : '-',
      backup.filesSize != null ? formatFileSize(backup.filesSize) : '-',
      backup.expiresAt ? formatExpiry(backup.expiresAt) : '-',
      backup.id,
      backup.description ? stripControlChars(backup.description) : '',
    ]);
    const widths = header.map((h, i) =>
      Math.max(h.length, ...rows.map((row) => row[i].length)),
    );
    const line = (cells: string[]) =>
      cells
        .map((cell, i) => cell.padEnd(widths[i]))
        .join('  ')
        .trimEnd();
    yield* Effect.log(chalk.dim(line(header)));
    for (const row of rows) {
      yield* Effect.log(line(row));
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

  // The server returns newest first; sort anyway so the table can't lie.
  const sorted = [...backups].sort(
    (a, b) => b.backupAt.getTime() - a.backupAt.getTime(),
  );
  yield* renderBackupsTable(sorted);
});

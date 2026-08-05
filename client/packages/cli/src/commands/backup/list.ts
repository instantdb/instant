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

// Relative times in both directions: "3 hours ago", "6 days from now".
export const relativeTime = (date: Date): string => {
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  if (abs < 60_000) return diffMs <= 0 ? 'just now' : 'now';
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const [count, unit] =
    minutes < 60
      ? [minutes, 'minute']
      : hours < 24
        ? [hours, 'hour']
        : [days, 'day'];
  const label = `${count} ${unit}${count === 1 ? '' : 's'}`;
  return diffMs < 0 ? `${label} ago` : `${label} from now`;
};

// One aligned row per backup, newest first: id first, relative times.
// `--json` carries the precise values.
export const renderBackupsTable = (backups: AppBackup[]) =>
  Effect.gen(function* () {
    const header = [
      'ID',
      'CREATED AT',
      'DB SIZE',
      'STORAGE',
      'EXPIRES AT',
      'DESCRIPTION',
    ];
    const rows = backups.map((backup) => [
      backup.id,
      relativeTime(backup.backupAt),
      backup.dbSize != null ? formatFileSize(backup.dbSize) : '-',
      backup.filesSize != null ? formatFileSize(backup.filesSize) : '-',
      backup.expiresAt
        ? backup.expiresAt.getTime() <= Date.now()
          ? 'expired'
          : relativeTime(backup.expiresAt)
        : '-',
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
    yield* Effect.log(chalk.dim(widths.map((w) => '-'.repeat(w)).join('  ')));
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

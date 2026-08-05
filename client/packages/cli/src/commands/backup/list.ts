import chalk from 'chalk';
import { Effect } from 'effect';

import type { backupListDef, OptsFromCommand } from '../../index.ts';
import {
  backupDataSize,
  formatBackupTime,
  formatBytes,
  loadActiveBackups,
  terminalText,
} from './shared.ts';

export const backupListCommand = Effect.fn(function* (
  opts: OptsFromCommand<typeof backupListDef>,
) {
  const { backups } = yield* loadActiveBackups('list');

  if (opts.json) {
    yield* Effect.log(JSON.stringify(backups, null, 2));
    return;
  }

  if (backups.length === 0) {
    yield* Effect.log('No backups available.');
    return;
  }

  for (const backup of backups) {
    yield* Effect.log(chalk.cyan(formatBackupTime(backup.backup_at)));
    if (backup.description) {
      yield* Effect.log(`  ${terminalText(backup.description)}`);
    }
    yield* Effect.log(`  ID: ${backup.id}`);
    yield* Effect.log(`  Data size: ${formatBytes(backupDataSize(backup))}`);
    yield* Effect.log(`  Expires: ${formatBackupTime(backup.expires_at!)}`);
  }
});

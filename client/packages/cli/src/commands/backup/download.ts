import { existsSync } from 'node:fs';
import path from 'node:path';
import ansiEscapes from 'ansi-escapes';
import chalk from 'chalk';
import { Effect } from 'effect';
import throttle from 'lodash.throttle';
import {
  backupZipName,
  estimateZipSize,
  type AppBackup,
  type BackupsManager,
} from '@instantdb/platform';
import type { backupDownloadDef, OptsFromCommand } from '../../index.ts';
import { BadArgsError } from '../../errors.ts';
import { GlobalOpts } from '../../context/globalOpts.ts';
import { PlatformApiError } from '../../context/platformApi.ts';
import { buildBackupsManager, useBackupsManager } from '../../lib/backups.ts';
import {
  downloadBackupToFile,
  type BackupDownloadProgress,
  type BackupDownloadResult,
} from '../../lib/backupDownload.ts';
import { promptOk, runUIEffect } from '../../lib/ui.ts';
import { UI } from '../../ui/index.ts';
import { formatBackupDate, formatBytes } from './list.ts';

const pickBackup = (
  backups: AppBackup[],
  backupId: string | undefined,
  opts: { latest?: boolean },
) =>
  Effect.gen(function* () {
    if (backupId) {
      const found = backups.find((b) => b.id === backupId);
      if (!found) {
        return yield* BadArgsError.make({
          message: `No backup found with id ${backupId}.`,
        });
      }
      return found;
    }

    // The server returns newest first; sort anyway so --latest can't silently
    // pick the wrong one.
    const sorted = [...backups].sort(
      (a, b) => b.backupAt.getTime() - a.backupAt.getTime(),
    );
    if (opts.latest) {
      return sorted[0];
    }

    const { yes } = yield* GlobalOpts;
    if (yes) {
      return yield* BadArgsError.make({
        message: 'Must specify a backup id or --latest',
      });
    }

    return yield* runUIEffect(
      new UI.Select({
        options: sorted.map((backup) => ({
          label:
            formatBackupDate(backup.backupAt) +
            (backup.description ? ` — ${backup.description}` : '') +
            ` ${chalk.dim(`(${backup.id})`)}`,
          value: backup,
        })),
        promptText: 'Select a backup to download:',
      }),
    );
  });

// Single-line progress on a TTY, nothing otherwise.
function makeProgressRenderer() {
  const stream = process.stderr;
  if (!stream.isTTY) {
    return { update: (_p: BackupDownloadProgress) => {}, done: () => {} };
  }
  let wrote = false;
  const write = (p: BackupDownloadProgress) => {
    const parts: string[] = [];
    parts.push(
      p.entitiesTotal == null
        ? 'listing namespaces…'
        : `namespaces ${p.entitiesCompleted}/${p.entitiesTotal}`,
    );
    if (p.filesTotal !== 0) {
      parts.push(
        p.filesTotal == null
          ? 'listing storage files…'
          : `storage files ${p.filesCompleted}/${p.filesTotal}`,
      );
    }
    let bytes = formatBytes(p.zipBytes);
    if (p.bytesTotal != null && p.bytesTotal > 0) {
      const pct = Math.min(100, Math.round((p.bytesRead / p.bytesTotal) * 100));
      bytes += ` (${pct}%)`;
    }
    parts.push(bytes);
    const currentEntry = p.currentEntity || p.currentFile;
    if (currentEntry) {
      parts.push(currentEntry);
    }
    let line = parts.join(' · ');
    const width = stream.columns || 80;
    if (line.length >= width) {
      line = line.slice(0, Math.max(0, width - 2)) + '…';
    }
    stream.write(ansiEscapes.eraseLine + ansiEscapes.cursorLeft + line);
    wrote = true;
  };
  const throttled = throttle(write, 100);
  return {
    update: throttled,
    done: () => {
      throttled.cancel();
      if (wrote) {
        stream.write(ansiEscapes.eraseLine + ansiEscapes.cursorLeft);
      }
    },
  };
}

// Returns null when the download was cancelled (ctrl-c). A second ctrl-c
// falls through to Node's default handler and kills the process outright.
async function runDownload(
  manager: BackupsManager,
  backup: AppBackup,
  outPath: string,
): Promise<BackupDownloadResult | null> {
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once('SIGINT', onSigint);
  const progress = makeProgressRenderer();
  try {
    return await downloadBackupToFile({
      manager,
      backup,
      outPath,
      signal: controller.signal,
      onProgress: progress.update,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') {
      return null;
    }
    throw e;
  } finally {
    process.removeListener('SIGINT', onSigint);
    progress.done();
  }
}

export const backupDownloadCmd = Effect.fn(function* (
  backupId: string | undefined,
  opts: OptsFromCommand<typeof backupDownloadDef>,
) {
  const backups = yield* useBackupsManager(
    (m) => m.list(),
    'Error listing backups',
  );

  if (backups.length === 0) {
    yield* Effect.log('No backups yet.');
    return;
  }

  const backup = yield* pickBackup(backups, backupId, opts);

  const sizes = estimateZipSize(backup);
  const estimate = sizes
    ? ` The zip file will be between ${formatBytes(sizes.min)} and ${formatBytes(sizes.max)}, depending on the compression ratio.`
    : '';

  const ok = yield* promptOk({
    promptText: `Download the backup from ${formatBackupDate(backup.backupAt)}?${estimate}`,
  });
  if (!ok) return;

  const outPath = path.resolve(opts.out ?? backupZipName(backup));
  if (existsSync(outPath)) {
    const overwrite = yield* promptOk({
      promptText: `${path.basename(outPath)} already exists. Overwrite?`,
    });
    if (!overwrite) return;
  }

  const manager = yield* buildBackupsManager;
  yield* Effect.log(`Downloading to ${outPath}`);

  const result = yield* Effect.tryPromise({
    try: () => runDownload(manager, backup, outPath),
    catch: (e) =>
      new PlatformApiError({ message: 'Error downloading backup', cause: e }),
  });

  if (result === null) {
    yield* Effect.log('Download cancelled.');
    return;
  }

  const filesPart =
    result.files > 0
      ? ` and ${result.files.toLocaleString()} storage files`
      : '';
  yield* Effect.log(
    `Saved ${result.entities.toLocaleString()} namespaces${filesPart} (${formatBytes(result.zipBytes)})`,
  );
});

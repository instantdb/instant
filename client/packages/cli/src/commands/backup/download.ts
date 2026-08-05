import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { Effect } from 'effect';
import {
  backupZipName,
  estimateZipSize,
  formatFileSize,
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
import { onTerminate, renderUnwrap } from '../../ui/lib.ts';
import { UI } from '../../ui/index.ts';
import { relativeTime, renderBackupsTable, stripControlChars } from './list.ts';

const pickBackup = (
  backups: AppBackup[],
  backupId: string | undefined,
  opts: { latest?: boolean },
) =>
  Effect.gen(function* () {
    if (backupId && opts.latest) {
      return yield* BadArgsError.make({
        message: 'Pass either a backup id or --latest, not both.',
      });
    }
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

    // Aligned like the `backup list` table so the options scan as columns:
    // created, sizes, expiry, description, id.
    const cells = sorted.map((backup) => [
      relativeTime(backup.backupAt),
      backup.dbSize != null ? formatFileSize(backup.dbSize) : '-',
      backup.filesSize != null ? formatFileSize(backup.filesSize) : '-',
      backup.expiresAt ? `expires ${relativeTime(backup.expiresAt)}` : '',
      backup.description ? stripControlChars(backup.description) : '',
    ]);
    const widths = cells[0].map((_, i) =>
      Math.max(...cells.map((row) => row[i].length)),
    );
    return yield* runUIEffect(
      new UI.Select({
        options: sorted.map((backup, idx) => ({
          label:
            cells[idx].map((cell, i) => cell.padEnd(widths[i])).join('  ') +
            ` ${chalk.dim(`(${backup.id})`)}`,
          value: backup,
        })),
        promptText: 'Select a backup to download:',
      }),
    );
  });

// One compact line for the spinner as the pipeline ticks.
function progressLine(p: BackupDownloadProgress): string {
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
  let bytes = formatFileSize(p.zipBytes);
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
  // The spinner prefixes a frame glyph; truncate so the line can't wrap.
  const width = (process.stdout.columns || 80) - 4;
  if (line.length > width) {
    line = line.slice(0, Math.max(0, width - 1)) + '…';
  }
  return line;
}

// Returns null when the download was cancelled. While the spinner is
// attached the terminal is raw, so ctrl-c arrives through the UI's
// terminate hook rather than SIGINT; both routes abort the same controller
// and the pipeline removes its partial file before we return. Outside the
// spinner (non-TTY runs), SIGINT covers it.
async function runDownload(
  manager: BackupsManager,
  backup: AppBackup,
  outPath: string,
): Promise<BackupDownloadResult | null> {
  const controller = new AbortController();
  const onSigint = () => controller.abort();
  process.once('SIGINT', onSigint);
  onTerminate(() => controller.abort());
  try {
    let spinner: UI.Spinner<unknown> | null = null;
    // Settled into a sentinel so the spinner always disappears cleanly and
    // cancellation/error output stays with the command below.
    const settled = downloadBackupToFile({
      manager,
      backup,
      outPath,
      signal: controller.signal,
      onProgress: (p) => spinner?.updateText(progressLine(p)),
    }).then(
      (result) => ({ result, error: null as unknown }),
      (error: unknown) => ({ result: null, error }),
    );
    if (process.stdout.isTTY) {
      spinner = new UI.Spinner({
        promise: settled,
        workingText: 'Preparing download…',
        disappearWhenDone: true,
      });
      await renderUnwrap(spinner);
    }
    const { result, error } = await settled;
    if (error) {
      if ((error as { name?: string })?.name === 'AbortError') return null;
      throw error;
    }
    return result;
  } finally {
    process.removeListener('SIGINT', onSigint);
    onTerminate(undefined);
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

  const outPath = path.resolve(opts.out ?? backupZipName(backup));
  // Catch this before the download runs, not at the final rename.
  if (existsSync(outPath) && statSync(outPath).isDirectory()) {
    return yield* BadArgsError.make({
      message: `${outPath} is a directory.`,
    });
  }

  yield* renderBackupsTable([backup]);
  const sizes = estimateZipSize(backup);
  if (sizes) {
    yield* Effect.log(
      `The zip file will be between ${formatFileSize(sizes.min)} and ${formatFileSize(sizes.max)}, depending on the compression ratio.`,
    );
  }
  yield* Effect.log(chalk.dim(`Saving to ${outPath} (pass -o to change).`));

  const ok = yield* promptOk({ promptText: 'Download this backup?' });
  if (!ok) return;

  if (existsSync(outPath)) {
    const overwrite = yield* promptOk({
      promptText: `${path.basename(outPath)} already exists. Overwrite?`,
    });
    if (!overwrite) return;
  }

  const manager = yield* buildBackupsManager;

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
    `Saved ${result.entities.toLocaleString()} namespaces${filesPart} (${formatFileSize(result.zipBytes)})`,
  );
});

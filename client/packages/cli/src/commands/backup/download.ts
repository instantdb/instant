import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { backupZipName, type InstantAppBackup } from '@instantdb/platform';
import { Effect } from 'effect';

import type { backupDownloadDef, OptsFromCommand } from '../../index.ts';
import { GlobalOpts } from '../../context/globalOpts.ts';
import { PlatformApiError } from '../../context/platformApi.ts';
import { BadArgsError } from '../../errors.ts';
import {
  type BackupArchiveProgress,
  downloadBackupArchive,
} from '../../lib/backupArchive.ts';
import { runUIEffect } from '../../lib/ui.ts';
import { UI } from '../../ui/index.ts';
import { onTerminate } from '../../ui/lib.ts';
import {
  backupDataSize,
  backupLabel,
  formatBytes,
  loadActiveBackups,
  terminalText,
} from './shared.ts';

const outputPathStatus = async (path: string) => {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() ? ('directory' as const) : ('file' as const);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'missing' as const;
    }
    throw error;
  }
};

const resolveBackup = (
  backups: readonly InstantAppBackup[],
  backupId: string | undefined,
  latest: boolean | undefined,
) =>
  Effect.gen(function* () {
    const { yes } = yield* GlobalOpts;
    if (backupId && latest) {
      return yield* BadArgsError.make({
        message: 'Specify a backup ID or --latest, not both.',
      });
    }
    if (backupId) {
      const backup = backups.find((candidate) => candidate.id === backupId);
      if (!backup) {
        return yield* BadArgsError.make({
          message: `Active backup not found: ${backupId}`,
        });
      }
      return backup;
    }
    if (latest) {
      if (!backups[0]) {
        return yield* BadArgsError.make({
          message: 'No backups available.',
        });
      }
      return backups[0];
    }
    if (yes) {
      return yield* BadArgsError.make({
        message: 'Specify a backup ID or --latest when using --yes.',
      });
    }
    if (backups.length === 0) return undefined;
    return yield* runUIEffect(
      new UI.Select<InstantAppBackup>({
        options: backups.map((backup) => ({
          label: backupLabel(backup),
          value: backup,
        })),
        promptText: 'Select a backup to download:',
        modifyOutput: UI.modifiers.vanishOnComplete,
      }),
    );
  });

const renderProgress = (progress: BackupArchiveProgress) => {
  const count =
    progress.phase === 'entities'
      ? `${progress.entitiesCompleted}/${progress.entitiesTotal ?? '?'} namespaces`
      : `${progress.storageCompleted}/${progress.storageDiscoveryComplete ? progress.storageTotal : '?'} storage files`;
  const percent =
    progress.bytesTotal && progress.bytesTotal > 0
      ? ` · ${Math.min(100, Math.round((progress.bytesRead / progress.bytesTotal) * 100))}%`
      : '';
  const entry = progress.currentEntry
    ? ` · ${terminalText(progress.currentEntry)}`
    : '';
  return `Downloading ${count} · ${formatBytes(progress.bytesWritten)}${percent}${entry}`;
};

export const backupDownloadCommand = Effect.fn(function* (
  backupId: string | undefined,
  opts: OptsFromCommand<typeof backupDownloadDef>,
) {
  const { yes } = yield* GlobalOpts;
  const { appId, manager, backups } = yield* loadActiveBackups('download');
  const backup = yield* resolveBackup(backups, backupId, opts.latest);
  if (!backup) {
    yield* Effect.log('No backups available.');
    return;
  }

  const outputPath = resolve(opts.output ?? backupZipName(backup));
  const outputStatus = yield* Effect.tryPromise(() =>
    outputPathStatus(outputPath),
  );
  if (outputStatus === 'directory') {
    return yield* BadArgsError.make({
      message: `Output path is a directory: ${outputPath}`,
    });
  }
  if (outputStatus === 'file' && !yes) {
    const replace = yield* runUIEffect(
      new UI.Confirmation({
        promptText: `File already exists. Replace ${outputPath}?`,
        defaultValue: false,
      }),
    );
    if (!replace) {
      yield* Effect.log('Cancelled.');
      return;
    }
  }

  const abortController = new AbortController();
  const abort = () => {
    if (abortController.signal.aborted) process.exit(130);
    abortController.abort();
  };
  process.once('SIGINT', abort);
  onTerminate(abort);

  let latestProgress: BackupArchiveProgress | undefined;
  let lastProgressUpdate = 0;
  let lastProgressEntry: string | null = null;
  let lastProgressPhase: BackupArchiveProgress['phase'] = 'entities';
  let lastStorageDiscoveryComplete = false;
  let spinner: UI.Spinner<Awaited<ReturnType<typeof downloadBackupArchive>>>;
  const promise = downloadBackupArchive({
    appId,
    backup,
    manager,
    outputPath,
    signal: abortController.signal,
    onProgress: (progress) => {
      latestProgress = progress;
      const now = Date.now();
      if (
        spinner &&
        (now - lastProgressUpdate >= 100 ||
          progress.currentEntry !== lastProgressEntry ||
          progress.phase !== lastProgressPhase ||
          progress.storageDiscoveryComplete !== lastStorageDiscoveryComplete)
      ) {
        lastProgressUpdate = now;
        lastProgressEntry = progress.currentEntry;
        lastProgressPhase = progress.phase;
        lastStorageDiscoveryComplete = progress.storageDiscoveryComplete;
        spinner.updateText(renderProgress(progress));
      }
    },
  });
  spinner = new UI.Spinner({
    promise,
    workingText: `Downloading ${formatBytes(backupDataSize(backup))} to ${outputPath}`,
    doneText: `Downloaded backup to ${outputPath}`,
    errorText: () =>
      abortController.signal.aborted
        ? 'Backup download cancelled.'
        : `Backup download failed${latestProgress?.currentEntry ? ` at ${terminalText(latestProgress.currentEntry)}` : ''}.`,
  });

  try {
    const result = yield* runUIEffect(spinner).pipe(
      Effect.mapError(
        (cause) =>
          new PlatformApiError({
            message: abortController.signal.aborted
              ? 'Backup download cancelled'
              : 'Could not download backup',
            cause,
          }),
      ),
    );
    yield* Effect.log(
      `Saved ${result.entities} namespaces and ${result.storageFiles} storage files (${formatBytes(result.bytesWritten)}).`,
    );
  } finally {
    process.off('SIGINT', abort);
    onTerminate(undefined);
  }
});

import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { ZipWriter } from '@zip.js/zip.js';
import type { BackupsManager, InstantAppBackup } from '@instantdb/platform';

export type BackupArchiveProgress = {
  phase: 'entities' | 'storage';
  entitiesCompleted: number;
  entitiesTotal: number | null;
  storageCompleted: number;
  storageTotal: number | null;
  storageDiscoveryComplete: boolean;
  bytesRead: number;
  bytesTotal: number | null;
  bytesWritten: number;
  currentEntry: string | null;
};

type DownloadBackupArchiveOptions = {
  appId: string;
  backup: InstantAppBackup;
  manager: BackupsManager;
  outputPath: string;
  signal?: AbortSignal;
  onProgress?: (progress: BackupArchiveProgress) => void;
};

export type BackupArchiveResult = {
  outputPath: string;
  bytesWritten: number;
  entities: number;
  storageFiles: number;
};

const removePartial = async (path: string) => {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

export async function downloadBackupArchive({
  appId,
  backup,
  manager,
  outputPath,
  signal,
  onProgress,
}: DownloadBackupArchiveOptions): Promise<BackupArchiveResult> {
  signal?.throwIfAborted();
  const partialPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${randomUUID()}.partial`,
  );
  const fileHandle = await open(partialPath, 'wx');
  const fileStream = fileHandle.createWriteStream();
  // finished() rejects if the stream errors before we await it below; the
  // noop catch keeps that from surfacing as an unhandled rejection.
  const fileFinished = finished(fileStream);
  void fileFinished.catch(() => undefined);

  const downloadController = new AbortController();
  const forwardAbort = () => downloadController.abort(signal?.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });
  const downloadSignal = downloadController.signal;
  const fileWriter = Writable.toWeb(fileStream).getWriter();
  const progress: BackupArchiveProgress = {
    phase: 'entities',
    entitiesCompleted: 0,
    entitiesTotal: null,
    storageCompleted: 0,
    storageTotal: null,
    storageDiscoveryComplete: false,
    bytesRead: 0,
    // Denominator for the % display: uncompressed entities + storage files,
    // since we read (and count) both. Gated on uncompressed_size — no size,
    // no percentage — with files_size added when present.
    bytesTotal:
      backup.uncompressed_size == null
        ? null
        : backup.uncompressed_size + (backup.files_size ?? 0),
    bytesWritten: 0,
    currentEntry: null,
  };
  const emitProgress = () => onProgress?.({ ...progress });
  const output = new WritableStream<Uint8Array>({
    async write(chunk) {
      progress.bytesWritten += chunk.byteLength;
      emitProgress();
      await fileWriter.write(chunk);
    },
    close() {
      return fileWriter.close();
    },
    abort(reason) {
      return fileWriter.abort(reason);
    },
  });
  const zipWriter = new ZipWriter(output, {
    zip64: true,
    signal: downloadSignal,
  });

  try {
    emitProgress();
    const entries = manager.downloadEntries(appId, backup, {
      signal: downloadSignal,
      callbacks: {
        onBackupFiles: (files) => {
          progress.entitiesTotal = files.filter(
            (file) => file.name !== 'config.json',
          ).length;
          emitProgress();
        },
        onStorageFile: () => {
          progress.storageTotal = (progress.storageTotal ?? 0) + 1;
          emitProgress();
        },
        onStorageComplete: () => {
          progress.storageTotal ??= 0;
          progress.storageDiscoveryComplete = true;
          emitProgress();
        },
      },
    });

    for await (const entry of entries) {
      progress.phase = entry.kind === 'storage' ? 'storage' : 'entities';
      progress.currentEntry = entry.sourceName;
      emitProgress();

      const countedInput = entry.input.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            progress.bytesRead += chunk.byteLength;
            emitProgress();
            controller.enqueue(chunk);
          },
        }),
      );
      await zipWriter.add(entry.name, countedInput, {
        lastModDate: entry.lastModified,
      });

      if (entry.kind === 'entity') progress.entitiesCompleted++;
      if (entry.kind === 'storage') progress.storageCompleted++;
      progress.currentEntry = null;
      emitProgress();
    }

    await zipWriter.close();
    await fileFinished;
    downloadSignal.throwIfAborted();

    // fsync before rename so a crash right after we report success can't
    // leave a truncated archive at outputPath.
    const file = await open(partialPath, 'r');
    try {
      await file.sync();
    } finally {
      await file.close();
    }

    downloadSignal.throwIfAborted();
    await rename(partialPath, outputPath);
    return {
      outputPath,
      bytesWritten: progress.bytesWritten,
      entities: progress.entitiesCompleted,
      storageFiles: progress.storageCompleted,
    };
  } catch (error) {
    downloadController.abort(error);
    fileStream.destroy(error instanceof Error ? error : undefined);
    await fileFinished.catch(() => {});
    await removePartial(partialPath);
    throw error;
  } finally {
    signal?.removeEventListener('abort', forwardAbort);
  }
}

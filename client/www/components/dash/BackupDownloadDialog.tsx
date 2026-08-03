import { useContext, useEffect, useRef, useState } from 'react';
import { AsyncZipDeflate, Zip } from 'fflate';
import { showSaveFilePicker } from 'native-file-system-adapter';

import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { jsonFetch } from '@/lib/fetch';
import { messageFromInstantError } from '@/lib/errors';
import { InstantApp, InstantAppBackup, InstantIssue } from '@/lib/types';

import {
  Button,
  Content,
  Dialog,
  SubsectionHeading,
  useDialog,
} from '@/components/ui';

import { formatTimestamp } from '@/components/dash/shared';

type BackupFile = { name: string; size: number };

type DownloadProgress = {
  entitiesCompleted: number;
  entitiesTotal: number | null;
  filesCompleted: number;
  filesTotal: number | null;
  bytes: number;
  // Empty while we aren't actively fetching from that phase — clear once
  // the yield is done so the line stops claiming a file after completion.
  currentEntity: string;
  currentFile: string;
  outputFilename: string;
};

function backupZipName(backup: InstantAppBackup): string {
  const safe = backup.backup_at.replace(/[:.]/g, '-');
  return `instant-backup-${safe}.zip`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  let v = n;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

async function fetchFiles(
  token: string,
  appId: string,
  backupId: string,
): Promise<BackupFile[]> {
  // XXX: Why are you using the authed fetch hook here?
  const { files } = (await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/backups/${backupId}/files`,
    { headers: { authorization: `Bearer ${token}` } },
  )) as { files: BackupFile[] };
  return files;
}

async function fetchFileUrl(
  token: string,
  appId: string,
  backupId: string,
  name: string,
): Promise<string> {
  // XXX: Why are you using the authed fetch hook here?
  const url = `${config.apiURI}/dash/apps/${appId}/backups/${backupId}/file-url?name=${encodeURIComponent(name)}`;
  const { url: signed } = (await jsonFetch(url, {
    headers: { authorization: `Bearer ${token}` },
  })) as { url: string };
  return signed;
}

type StorageFileLine = {
  locationId: string;
  path: string;
  url: string;
};

type DownloadResult =
  | { via: 'picker'; filename: string }
  | { via: 'browser-default'; filename: string };

type SaveFileHandle = Awaited<ReturnType<typeof showSaveFilePicker>>;

type ZipEntry = {
  name: string;
  lastModified: Date;
  input: ReadableStream<Uint8Array>;
};

// Build a zip output stream using fflate's streaming Zip writer with
// async DEFLATE level 6 (workers do the compression off the main thread).
// Each input stream is consumed chunk-by-chunk; the final chunk is flagged
// via look-ahead — push() needs to know which chunk is the last.
//
// The closed flag guards against the async deflate workers calling back
// after the controller has already errored or been cancelled (e.g. user
// aborts mid-download): controller.enqueue throws on an errored stream,
// and we want to swallow that quietly while also terminating the workers
// so they stop burning CPU.
function fflateZipStream(
  entries: AsyncIterable<ZipEntry>,
): ReadableStream<Uint8Array> {
  let closed = false;
  let zip: Zip | null = null;
  const terminate = () => {
    try {
      (zip as unknown as { terminate?: () => void })?.terminate?.();
    } catch {
      // swallow — best-effort cleanup
    }
  };
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      zip = new Zip((err, data, final) => {
        if (closed) return;
        if (err) {
          closed = true;
          controller.error(err);
          return;
        }
        if (data && data.byteLength > 0) {
          try {
            controller.enqueue(data);
          } catch {
            closed = true;
            terminate();
            return;
          }
        }
        if (final) {
          closed = true;
          controller.close();
        }
      });
      try {
        for await (const entry of entries) {
          if (closed) break;
          const file = new AsyncZipDeflate(entry.name, { level: 6 });
          file.mtime = entry.lastModified;
          zip.add(file);
          const reader = entry.input.getReader();
          let pending: Uint8Array | null = null;
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              file.push(pending ?? new Uint8Array(0), true);
              break;
            }
            if (pending !== null) file.push(pending, false);
            pending = value;
          }
        }
        if (!closed) zip.end();
      } catch (e) {
        if (!closed) {
          closed = true;
          controller.error(e);
        }
        terminate();
      }
    },
    cancel() {
      closed = true;
      terminate();
    },
  });
}

async function registerDownloadServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register('/native-file-system-adapter-sw.js');
    await navigator.serviceWorker.ready;
  } catch {
    // falls back to constructing a blob
  }
}

async function downloadBackup(
  token: string,
  appId: string,
  backup: InstantAppBackup,
  setProgress: (p: DownloadProgress) => void,
  abortController: AbortController,
): Promise<DownloadResult> {
  const filename = backupZipName(backup);

  // Acquire the save destination first to prevent the the picker
  // frowm throwing a SecurityError on async access.
  const pickerHandle: SaveFileHandle = await showSaveFilePicker({
    suggestedName: filename,
    types: [
      {
        description: 'ZIP Archive',
        accept: { 'application/zip': ['.zip'] },
      },
    ],
  });

  // ---- Shared progress state ----
  // current = files (backup + storage) fully fetched.
  // total = backup file count + storage files ever discovered.
  // `storagePending` is a FIFO of yet-to-fetch storage files only — entries
  // are shift()'d off as the generator processes them so the queue stays
  // bounded by (discovery rate - fetch rate). `storageDiscovered` is the
  // monotone counter used for the denominator.
  // Two parallel counters surfaced in the dialog:
  //   entities — the backup payload (config.json + per-etype JSONL shards).
  //   files    — the user's $files (storage uploads).
  // entitiesTotal is null until fetchFiles resolves; filesTotal is null
  // until the discovery NDJSON returns at least one line OR completes
  // (404/empty body sets it to 0 so the dialog shows "0 of 0 files").
  let entitiesCompleted = 0;
  let entitiesTotal: number | null = null;
  let filesCompleted = 0;
  let filesTotal: number | null = null;
  let currentEntity = '';
  let currentFile = '';
  let outputFilename = pickerHandle?.name ?? filename;
  let zipBytes = 0;
  const storagePending: StorageFileLine[] = [];
  let storageDone = false;
  let storageError: Error | null = null;
  let waitResolve: (() => void) | null = null;

  // The caller-supplied AbortController is shared across every fetch we
  // own (the NDJSON discovery stream, backup file body fetches, storage
  // file body fetches). The caller can abort it externally (e.g. dialog
  // close) and we also abort it from our own catch so the discovery stops
  // pulling from S3 if the zip pipeline throws.
  const signal = abortController.signal;

  const tick = () =>
    setProgress({
      entitiesCompleted,
      entitiesTotal,
      filesCompleted,
      filesTotal,
      bytes: zipBytes,
      currentEntity,
      currentFile,
      outputFilename,
    });

  const notify = () => {
    const w = waitResolve;
    waitResolve = null;
    w?.();
  };

  // Kick off storage-files discovery in parallel with the backup file list.
  // It pushes onto storagePending and bumps `storageDiscovered` as URLs
  // stream in.
  void (async () => {
    // Set once we see the server's terminal `done` sentinel (or a 404, which
    // means there's no $files shard at all). If discovery ends without it and
    // we weren't aborted, the stream was truncated by a server-side failure.
    let storageComplete = false;
    try {
      const res = await fetch(
        `${config.apiURI}/dash/apps/${appId}/backups/${backup.id}/storage-files`,
        { headers: { authorization: `Bearer ${token}` }, signal },
      );
      if (res.status === 404) {
        filesTotal = 0;
        storageComplete = true;
        tick();
        return;
      }
      if (!res.ok || !res.body) {
        throw new Error(`Failed to list storage files: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const consume = (line: string) => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return;
        const obj = JSON.parse(trimmed) as StorageFileLine & {
          done?: boolean;
        };
        if (obj.done) {
          storageComplete = true;
          return;
        }
        if (!obj.locationId || !obj.url) return;
        storagePending.push(obj);
        filesTotal = (filesTotal ?? 0) + 1;
        tick();
        notify();
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl !== -1) {
          consume(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
        }
      }
      consume(buf);
    } catch (e) {
      // The abort path is expected when the zip pipeline failed and we
      // tore the discovery down
      if ((e as { name?: string })?.name !== 'AbortError') {
        storageError = e as Error;
      }
    } finally {
      // Discovery finished without ever calling consume (empty stream) —
      // surface "0 of 0" so the dialog doesn't sit on "?" forever.
      if (filesTotal == null) filesTotal = 0;
      // No `done` sentinel and we weren't aborted → the server closed the
      // pipe early. Fail loudly instead of building a partial zip. Don't
      // clobber a more specific error already caught above.
      if (!storageComplete && storageError == null && !signal.aborted) {
        storageError = new Error(
          'Storage file listing ended before it finished. Please retry the download.',
        );
      }
      storageDone = true;
      tick();
      notify();
    }
  })();

  let files: BackupFile[];
  try {
    files = await fetchFiles(token, appId, backup.id);
    if (files.length === 0) {
      throw new Error('No files found for this backup.');
    }
  } catch (e) {
    // Entity discovery failed before we reached the zip pipeline's own
    // teardown. Stop the background storage-files discovery stream so it
    // doesn't keep pulling from S3 after we bail.
    abortController.abort();
    throw e;
  }
  entitiesTotal = files.length;
  tick();

  const entries = (async function* () {
    for (const f of files) {
      currentEntity = f.name;
      tick();
      const url = await fetchFileUrl(token, appId, backup.id, f.name);
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${f.name}: ${res.status}`);
      }
      entitiesCompleted++;
      tick();
      yield {
        name: f.name,
        lastModified: new Date(backup.backup_at),
        input: res.body!,
      };
    }
    // Entity phase done — clear so the dialog stops claiming we're still
    // downloading an entity file once we move into storage.
    currentEntity = '';
    tick();

    while (true) {
      const obj = storagePending.shift();
      if (obj) {
        currentFile = obj.path || obj.locationId;
        tick();
        const fileRes = await fetch(obj.url, { signal });
        if (!fileRes.ok) {
          throw new Error(
            `Couldn't download storage file "${obj.path}" (HTTP ${fileRes.status}).`,
          );
        }
        filesCompleted++;
        tick();
        yield {
          name: `files/${obj.locationId}`,
          lastModified: new Date(backup.backup_at),
          input: fileRes.body!,
        };
      } else if (storageDone) {
        break;
      } else {
        await new Promise<void>((resolve) => {
          waitResolve = resolve;
        });
      }
    }
    // Storage phase done, clear so the dialog stops showing the last file.
    currentFile = '';
    tick();

    if (storageError) throw storageError;
  })();

  // Count bytes as the zip stream flows through to the final sink. Throttle
  // the progress updates by time: a large backup pushes many small chunks and
  // ticking (a React setState) on every one would flood re-renders, but a
  // byte-based threshold stalls when the compressed stream is smaller than the
  // threshold. Ticking at most every 100ms updates smoothly for any size while
  // capping re-renders at ~10/sec; flush() reports the final total.
  const TICK_INTERVAL_MS = 100;
  let lastTickAt = 0;
  const byteCounter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      zipBytes += chunk.byteLength;
      const now = Date.now();
      if (now - lastTickAt >= TICK_INTERVAL_MS) {
        lastTickAt = now;
        tick();
      }
      controller.enqueue(chunk);
    },
    flush() {
      // Report the final byte total once the stream drains.
      tick();
    },
  });
  const countedBody = fflateZipStream(entries).pipeThrough(byteCounter);

  try {
    await registerDownloadServiceWorker();
    const writable = await pickerHandle.createWritable();
    await countedBody.pipeTo(writable);
    return { via: 'picker', filename: pickerHandle.name ?? filename };
  } catch (e) {
    // Tear down the background discovery and any in-flight body fetches
    // so we don't keep pulling from S3 after the zip pipeline has failed.
    abortController.abort();
    throw e;
  }
}

type DownloadDialogState =
  | { kind: 'confirm' }
  | { kind: 'downloading'; progress: DownloadProgress | null }
  | {
      kind: 'complete';
      result: DownloadResult;
      progress: DownloadProgress | null;
    }
  | { kind: 'error'; message: string; progress: DownloadProgress | null };

export function DownloadDialog({
  app,
  backup,
  dialog,
}: {
  app: InstantApp;
  backup: InstantAppBackup;
  dialog: ReturnType<typeof useDialog>;
}) {
  const token = useContext(TokenContext);
  const [state, setState] = useState<DownloadDialogState>({ kind: 'confirm' });
  const abortRef = useRef<AbortController | null>(null);

  // Reset the dialog body whenever it's reopened so the user sees the
  // confirm screen again rather than the stale result of a previous run.
  useEffect(() => {
    if (dialog.open) setState({ kind: 'confirm' });
  }, [dialog.open]);

  // Upper bound: everything stored uncompressed (STORE mode and/or files
  // that don't compress). Lower bound: everything compressed at a ~3x
  // DEFLATE ratio, best case for text/JSON, but storage files vary wildly
  // (raw text compresses well, already-compressed images/videos don't).
  // We apply the same divisor to both since we can't see the file types
  // from here; the actual zip will land somewhere inside the range.
  const backupBytes = backup.uncompressed_size ?? backup.db_size;
  const filesBytes = backup.files_size;
  const hasSizes = backupBytes != null && filesBytes != null;
  const totalBytes = (backupBytes ?? 0) + (filesBytes ?? 0);
  const maxBytes = totalBytes;
  const minBytes = Math.round(totalBytes / 3);

  const start = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: 'downloading', progress: null });
    try {
      const result = await downloadBackup(
        token,
        app.id,
        backup,
        (progress) => {
          setState((prev) =>
            prev.kind === 'downloading' ? { ...prev, progress } : prev,
          );
        },
        controller,
      );
      setState((prev) => ({
        kind: 'complete',
        result,
        progress: prev.kind === 'downloading' ? prev.progress : null,
      }));
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') {
        // Exit if picker dismissed or dialog closed mid-download
        dialog.onClose();
        return;
      }
      const msg =
        messageFromInstantError(e as InstantIssue) ||
        (e instanceof Error ? e.message : null) ||
        'Failed to download backup.';
      setState((prev) => ({
        kind: 'error',
        message: msg,
        progress: prev.kind === 'downloading' ? prev.progress : null,
      }));
    } finally {
      abortRef.current = null;
    }
  };

  const close = () => {
    abortRef.current?.abort();
    dialog.onClose();
  };

  let body;
  if (state.kind === 'confirm') {
    body = (
      <div className="flex flex-col gap-4">
        <SubsectionHeading>Download backup</SubsectionHeading>
        <Content>
          Download the snapshot from{' '}
          <strong>{formatTimestamp(backup.backup_at)}</strong>. This will
          download a zip file containing all entities and all files.
        </Content>
        {hasSizes ? (
          <Content>
            The zip file will be between{' '}
            <strong>{formatBytes(minBytes)}</strong> and{' '}
            <strong>{formatBytes(maxBytes)}</strong>, depending on the
            compression ratio.
          </Content>
        ) : null}
        <div className="flex flex-row gap-2">
          <Button type="button" variant="primary" onClick={start}>
            Download
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
        </div>
      </div>
    );
  } else if (
    state.kind === 'downloading' ||
    state.kind === 'complete' ||
    state.kind === 'error'
  ) {
    const progress = state.progress;
    const entitiesDone = progress?.entitiesCompleted ?? 0;
    const entitiesTotal = progress?.entitiesTotal ?? null;
    const filesDone = progress?.filesCompleted ?? 0;
    const filesTotal = progress?.filesTotal ?? null;
    const savingVerb = state.kind === 'complete' ? 'Saved to' : 'Saving to';
    const progressBlock = (
      <div className="flex min-w-0 flex-col gap-1 text-gray-500 dark:text-neutral-500">
        <div className="flex min-w-0 items-baseline gap-3 tabular-nums">
          <span className="shrink-0">
            {entitiesTotal == null
              ? `Listing namespaces…`
              : `${entitiesDone.toLocaleString()} of ${entitiesTotal.toLocaleString()} namespaces`}
          </span>
          <span className="min-w-0 flex-1 truncate text-right font-mono">
            {progress?.currentEntity ?? ''}
          </span>
        </div>
        {filesTotal === 0 ? null : (
          <div className="flex min-w-0 items-baseline gap-3 tabular-nums">
            <span className="shrink-0">
              {filesTotal == null
                ? `Listing storage files…`
                : `${filesDone.toLocaleString()} of ${filesTotal.toLocaleString()} storage files`}
            </span>
            <span className="min-w-0 flex-1 truncate text-right font-mono">
              {progress?.currentFile ?? ''}
            </span>
          </div>
        )}
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate">
            {savingVerb}{' '}
            <span className="font-mono">{progress?.outputFilename ?? ''}</span>
          </span>
          <span className="shrink-0 tabular-nums">
            {formatBytes(progress?.bytes ?? 0)}
          </span>
        </div>
      </div>
    );

    if (state.kind === 'downloading') {
      body = (
        <div className="flex min-w-0 flex-col gap-4">
          <SubsectionHeading>Downloading backup</SubsectionHeading>
          {progressBlock}
          <Content>
            Keep this dialog open until the zip finishes writing.
          </Content>
          <div>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      );
    } else if (state.kind === 'complete') {
      body = (
        <div className="flex min-w-0 flex-col gap-4">
          <SubsectionHeading>Download complete</SubsectionHeading>
          {progressBlock}
          <Content>{' '}</Content>
          <div>
            <Button type="button" variant="secondary" onClick={close}>
              Close
            </Button>
          </div>
        </div>
      );
    } else {
      body = (
        <div className="flex min-w-0 flex-col gap-4">
          <SubsectionHeading>Download failed</SubsectionHeading>
          {progressBlock}
          <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm break-words text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {state.message}
          </div>
          <div>
            <Button type="button" variant="secondary" onClick={close}>
              Close
            </Button>
          </div>
        </div>
      );
    }
  }

  return (
    <Dialog title="Download backup" {...dialog}>
      {body}
    </Dialog>
  );
}

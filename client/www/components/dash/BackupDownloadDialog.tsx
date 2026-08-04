import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ArrowsPointingOutIcon, XMarkIcon } from '@heroicons/react/24/outline';

import config from '@/lib/config';
import { jsonFetch } from '@/lib/fetch';
import { messageFromInstantError } from '@/lib/errors';
import { InstantApp, InstantAppBackup, InstantIssue } from '@/lib/types';

import { Button, Content, Dialog, SubsectionHeading } from '@/components/ui';

import { formatTimestamp } from '@/components/dash/shared';
import { useDarkMode } from '@/components/dash/DarkModeToggle';

type BackupFile = { name: string; size: number };

type DownloadProgress = {
  entitiesCompleted: number;
  entitiesTotal: number | null;
  filesCompleted: number;
  filesTotal: number | null;
  // Compressed bytes written to disk so far (the zip's on-disk size).
  bytes: number;
  // Uncompressed bytes read from source bodies, and the backup's known
  // uncompressed total — the numerator/denominator for the % progress bar.
  // bytesTotal is null when the backup row carries no sizes.
  bytesRead: number;
  bytesTotal: number | null;
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
  // Decimal (1000-based) units with SI labels, to match how macOS/Finder
  // reports file sizes so the number lines up with what lands on disk.
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

async function fetchFiles(
  token: string,
  appId: string,
  backupId: string,
  signal: AbortSignal,
): Promise<BackupFile[]> {
  // XXX: Why are you using the authed fetch hook here?
  const { files } = (await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/backups/${backupId}/files`,
    { headers: { authorization: `Bearer ${token}` }, signal },
  )) as { files: BackupFile[] };
  return files;
}

async function fetchFileUrl(
  token: string,
  appId: string,
  backupId: string,
  name: string,
  signal: AbortSignal,
): Promise<string> {
  // XXX: Why are you using the authed fetch hook here?
  const url = `${config.apiURI}/dash/apps/${appId}/backups/${backupId}/file-url?name=${encodeURIComponent(name)}`;
  const { url: signed } = (await jsonFetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal,
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

type SaveFileHandle = Awaited<
  ReturnType<typeof import('native-file-system-adapter').showSaveFilePicker>
>;

type ZipEntry = {
  name: string;
  lastModified: Date;
  input: ReadableStream<Uint8Array>;
};

async function registerDownloadServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  // The service worker only backs native-file-system-adapter's fallback
  // writable, used to stream to disk on browsers without the File System Access
  // API. When the native API is present (Chromium), the picker returns a real
  // file handle and createWritable() streams straight to disk — no SW needed.
  if ('showSaveFilePicker' in window) {
    return;
  }

  try {
    await navigator.serviceWorker.register('/native-file-system-adapter-sw.js');
    // Bound the activation wait: `ready` can hang if the worker registers but
    // never activates, and the Download button waits on this — so a stall must
    // not wedge it. Worst case we proceed and the adapter falls back to a blob.
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  } catch {
    // Registration failed — the adapter falls back to constructing a blob.
  }
}

async function downloadBackup(
  // Passed in already-loaded (not imported here): showSaveFilePicker must be
  // invoked synchronously from the click to keep the browser's transient
  // activation, so awaiting an import() first would trip a SecurityError.
  showSaveFilePicker: typeof import('native-file-system-adapter').showSaveFilePicker,
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
  // `storageQueue` is a FIFO of yet-to-fetch storage files only — dequeued as
  // the generator processes them, so it stays bounded by (discovery rate -
  // fetch rate). It's an object with head/tail indices rather than an array
  // because discovery streams the whole list in up front: Array.shift() is O(n),
  // so draining a large backup would be O(n²). Object access is O(1) and delete
  // frees each slot as it's consumed.
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
  let uncompressedRead = 0;
  // Denominator for the % bar: uncompressed entities + storage files, since we
  // read (and count) both. Gated on uncompressed_size — no size, no bar — with
  // files_size added when present.
  const bytesTotal =
    backup.uncompressed_size != null
      ? backup.uncompressed_size + (backup.files_size ?? 0)
      : null;
  const storageQueue: Record<number, StorageFileLine> = {};
  let queueHead = 0;
  let queueTail = 0;
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
      bytesRead: uncompressedRead,
      bytesTotal,
      currentEntity,
      currentFile,
      outputFilename,
    });

  // Count uncompressed bytes as each source body streams through, for the %
  // bar. This is the input size (matches backup.uncompressed_size); zipBytes
  // is the compressed output written to disk.
  const countRead = (
    body: ReadableStream<Uint8Array>,
  ): ReadableStream<Uint8Array> =>
    body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          uncompressedRead += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
    );

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
        storageQueue[queueTail++] = obj;
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
    files = await fetchFiles(token, appId, backup.id, signal);
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

  // Entry write order is significant for restore: config first, then the
  // entities/*.jsonl shards, then files/${locationId}. In particular ALL entity
  // files must be written before ANY storage file. This generator preserves
  // that: it yields the entity `files` (config + entities/*.jsonl, in the order
  // fetchFiles returns them) to completion, then drains the storage queue.
  const entries = (async function* (): AsyncGenerator<ZipEntry> {
    for (const f of files) {
      currentEntity = f.name;
      tick();
      const url = await fetchFileUrl(token, appId, backup.id, f.name, signal);
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${f.name}: ${res.status}`);
      }
      entitiesCompleted++;
      tick();
      yield {
        name: f.name,
        lastModified: new Date(backup.backup_at),
        input: countRead(res.body!),
      };
    }
    // Entity phase done — clear so the dialog stops claiming we're still
    // downloading an entity file once we move into storage.
    currentEntity = '';
    tick();

    while (true) {
      let obj: StorageFileLine | undefined;
      if (queueHead < queueTail) {
        obj = storageQueue[queueHead];
        delete storageQueue[queueHead];
        queueHead++;
      }
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
          input: countRead(fileRes.body!),
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

  // Throttle progress updates by time: a large backup pushes many small chunks
  // and ticking (a React setState) on every one would flood re-renders. Ticking
  // at most every 100ms stays smooth at any size while capping re-renders.
  const TICK_INTERVAL_MS = 100;
  let lastTickAt = 0;

  let diskWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  try {
    // Load the zip encoder on demand (kept out of the shared bundle). Inside the
    // try so a chunk-load failure aborts the background discovery too.
    const { ZipWriter } = await import('@zip.js/zip.js');
    const writable = await pickerHandle.createWritable();
    const writer = writable.getWriter();
    diskWriter = writer;
    // Sink that zip.js writes compressed bytes into: it tallies the on-disk
    // (compressed) size for progress, then forwards to the file. Awaiting the
    // disk write propagates backpressure up into zip.js, so a fast source can't
    // outrun the disk and balloon memory.
    const countingSink = new WritableStream<Uint8Array>({
      async write(chunk) {
        zipBytes += chunk.byteLength;
        const now = Date.now();
        if (now - lastTickAt >= TICK_INTERVAL_MS) {
          lastTickAt = now;
          tick();
        }
        await writer.write(chunk);
      },
      async close() {
        await writer.close();
        tick();
      },
      async abort(reason) {
        await writer.abort(reason);
      },
    });

    // zip64: without it any archive whose central-directory offset passes 4GB
    // writes a wrapped 32-bit offset and the zip is unreadable. Everything else
    // is left at zip.js's defaults: workers + CompressionStream when available
    // (compression and CRC32 run off the main thread so a multi-GB backup
    // doesn't jank the tab), each degrading to an inline main-thread codec on
    // browsers that lack them — correctness (incl. zip64) is unaffected either way.
    const zipWriter = new ZipWriter(countingSink, { zip64: true, signal });
    for await (const entry of entries) {
      await zipWriter.add(entry.name, entry.input, {
        lastModDate: entry.lastModified,
      });
    }
    await zipWriter.close();
    return { via: 'picker', filename: pickerHandle.name ?? filename };
  } catch (e) {
    // Tear down the background discovery and any in-flight body fetches so we
    // don't keep pulling from S3, and discard the partial file on disk.
    abortController.abort();
    await diskWriter?.abort(e).catch(() => {});
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

type DownloadItem = {
  id: string;
  app: InstantApp;
  backup: InstantAppBackup;
  token: string;
  open: boolean;
};

type DownloadStatus = DownloadDialogState['kind'];

type BackupDownloadsApi = {
  // Open (or focus) the download dialog for a backup. Safe to call from
  // anywhere under the provider — the download itself lives at the app root,
  // so it survives tab switches and route changes.
  open: (app: InstantApp, backup: InstantAppBackup, token: string) => void;
  // The single in-flight/finished download, so backup rows can label their own
  // button and disable the others while one is actively downloading.
  active: { id: string; status: DownloadStatus } | null;
};

const BackupDownloadsContext = createContext<BackupDownloadsApi | null>(null);

export function useBackupDownloads(): BackupDownloadsApi {
  const ctx = useContext(BackupDownloadsContext);
  if (!ctx) {
    throw new Error(
      'useBackupDownloads must be used within a BackupDownloadProvider',
    );
  }
  return ctx;
}

// Mount once near the app root so the download keeps running (and stays
// reachable via its pill) across tab switches and route changes. Only open/
// close/done/busy transitions re-render here; the download's fast-moving
// progress state is isolated inside DownloadInstance, so ticks don't re-render
// the app tree.
export function BackupDownloadProvider({ children }: { children: ReactNode }) {
  // At most one download at a time.
  const [item, setItem] = useState<DownloadItem | null>(null);
  // The instance reports its state up so rows can reflect it. Coarse (changes a
  // few times per download), so it doesn't re-render on progress ticks.
  const [status, setStatus] = useState<DownloadStatus>('confirm');
  // Latest values for the stable `open` callback to read without going stale.
  const itemRef = useRef(item);
  const statusRef = useRef(status);
  useEffect(() => {
    itemRef.current = item;
    statusRef.current = status;
  }, [item, status]);

  const setOpen = useCallback(
    (open: boolean) => setItem((cur) => (cur ? { ...cur, open } : cur)),
    [],
  );
  const removeItem = useCallback(() => setItem(null), []);

  // Stable identity so context consumers (backup rows) only re-render when the
  // active download itself changes, never from its progress ticks.
  const open = useCallback(
    (app: InstantApp, backup: InstantAppBackup, token: string) => {
      const cur = itemRef.current;
      // Re-opening the active download's own row just resurfaces its dialog.
      if (cur && cur.id === backup.id) {
        setOpen(true);
        return;
      }
      // Never clobber a download that's actively writing to disk. (Rows for
      // other backups are disabled in this state, so this is just a guard.)
      if (cur && statusRef.current === 'downloading') return;
      // No active download, or the previous one is finished — start fresh.
      setStatus('confirm');
      setItem({ id: backup.id, app, backup, token, open: true });
    },
    [setOpen],
  );

  const active = useMemo(
    () => (item ? { id: item.id, status } : null),
    [item, status],
  );
  const api = useMemo(() => ({ open, active }), [open, active]);

  return (
    <BackupDownloadsContext.Provider value={api}>
      {children}
      {item ? (
        <DownloadInstance
          key={item.id}
          app={item.app}
          backup={item.backup}
          token={item.token}
          open={item.open}
          onStatusChange={setStatus}
          onRequestOpen={() => setOpen(true)}
          onRequestClose={() => setOpen(false)}
          onDone={removeItem}
        />
      ) : null}
    </BackupDownloadsContext.Provider>
  );
}

function DownloadInstance({
  app,
  backup,
  token,
  open,
  onStatusChange,
  onRequestOpen,
  onRequestClose,
  onDone,
}: {
  app: InstantApp;
  backup: InstantAppBackup;
  token: string;
  open: boolean;
  onStatusChange: (status: DownloadStatus) => void;
  onRequestOpen: () => void;
  onRequestClose: () => void;
  onDone: () => void;
}) {
  const { darkMode } = useDarkMode();
  const [state, setState] = useState<DownloadDialogState>({ kind: 'confirm' });
  const abortRef = useRef<AbortController | null>(null);
  // Set when the user cancels. The download promise rejects asynchronously with
  // AbortError, and by then a replacement download for the same backup.id may
  // own the slot — so the late rejection must not run onDone and tear it down.
  const canceledRef = useRef(false);

  // Report this download's coarse state up so backup rows can label their
  // button and disable the others while it's running.
  useEffect(() => {
    onStatusChange(state.kind);
  }, [state.kind, onStatusChange]);

  // The save picker must be invoked synchronously from the Download click, so
  // we preload it here (it also keeps the zip deps out of the shared bundle)
  // and disable the button until it's ready
  const pickerRef = useRef<
    typeof import('native-file-system-adapter').showSaveFilePicker | null
  >(null);
  const [pickerReady, setPickerReady] = useState(false);
  useEffect(() => {
    void Promise.all([
      import('native-file-system-adapter').then((m) => {
        pickerRef.current = m.showSaveFilePicker;
      }),
      // Register the fallback's service worker up front (no-op on Chromium) so
      // it's active before we write, rather than installing it in the hot path.
      registerDownloadServiceWorker(),
    ]).then(() => setPickerReady(true));
  }, []);

  // While actively downloading, warn before a full page unload (tab close,
  // refresh, external/hard navigation) — that tears down the JS context and
  // aborts the download mid-write. Client-side in-app navigation is fine: the
  // provider lives at the app root, so the download survives it and isn't
  // blocked here.
  useEffect(() => {
    if (state.kind !== 'downloading') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers need a truthy returnValue to show the native prompt;
      // the typed member is deprecated, so assign it off a plain-object cast.
      (e as { returnValue: unknown }).returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.kind]);

  // The download outlives the modal. Closing mid-download minimizes to a pill
  // (see handleClose) while the state machine keeps running; dismissing tears
  // the whole instance down via onDone.

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
  const minBytes = Math.round(totalBytes / 4);

  const start = async () => {
    const showSaveFilePicker = pickerRef.current;
    if (!showSaveFilePicker) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: 'downloading', progress: null });
    try {
      const result = await downloadBackup(
        showSaveFilePicker,
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
        // Picker dismissed or the user cancelled — tear this instance down so
        // no pill lingers. But if the user cancelled, onDone already ran and a
        // replacement download for the same backup.id may now own the slot, so
        // this stale run must not remove it.
        if (!canceledRef.current) onDone();
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

  // Hide the dialog but keep the download running in the background; the
  // minimized pill takes over. Backdrop click / Escape route here too.
  const minimize = onRequestClose;

  // Tear this instance down entirely — dismiss a finished or not-yet-started
  // download so no pill lingers.
  const dismiss = onDone;

  // Abort an in-flight download, then dismiss it. This is the only path that
  // truly stops a running download.
  const cancel = () => {
    canceledRef.current = true;
    abortRef.current?.abort();
    onDone();
  };

  // Closing the dialog chrome (backdrop / Escape / X) minimizes a running
  // download; for any other state it's a real dismiss.
  const handleClose = () => {
    if (state.kind === 'downloading') minimize();
    else dismiss();
  };

  const progress = state.kind === 'confirm' ? null : state.progress;
  // Percentage over the backup's uncompressed size. null (no bar) when the row
  // has no size. Reads can slightly exceed the recorded total, and a finished
  // download should read as 100%.
  const pct =
    progress?.bytesTotal != null && progress.bytesTotal > 0
      ? Math.min(
          100,
          state.kind === 'complete'
            ? 100
            : ((progress.bytesRead ?? 0) / progress.bytesTotal) * 100,
        )
      : null;

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
          <Button
            type="button"
            variant="primary"
            onClick={start}
            disabled={!pickerReady}
          >
            Download
          </Button>
          <Button type="button" variant="secondary" onClick={dismiss}>
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
            {pct != null ? ` · ${Math.round(pct)}%` : ''}
          </span>
        </div>
        {pct != null ? (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-gray-500 transition-[width] duration-150 dark:bg-neutral-400"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>
    );

    if (state.kind === 'downloading') {
      body = (
        <div className="flex min-w-0 flex-col gap-4">
          <SubsectionHeading>Downloading backup</SubsectionHeading>
          {progressBlock}
          <div className="flex flex-row gap-2">
            <Button type="button" variant="secondary" onClick={minimize}>
              Minimize
            </Button>
            <Button type="button" variant="destructive" onClick={cancel}>
              Cancel download
            </Button>
          </div>
        </div>
      );
    } else if (state.kind === 'complete') {
      body = (
        <div className="flex min-w-0 flex-col gap-4">
          <SubsectionHeading>Download complete</SubsectionHeading>
          <div className="flex min-w-0 flex-col gap-1 text-gray-500 dark:text-neutral-500">
            <div className="tabular-nums">
              {entitiesDone.toLocaleString()} namespaces
            </div>
            {filesTotal === 0 ? null : (
              <div className="tabular-nums">
                {filesDone.toLocaleString()} storage files
              </div>
            )}
            <div className="flex min-w-0 items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate">
                Saved to{' '}
                <span className="font-mono">
                  {progress?.outputFilename ?? backupZipName(backup)}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {formatBytes(progress?.bytes ?? 0)}
              </span>
            </div>
          </div>
          <div>
            <Button type="button" variant="secondary" onClick={dismiss}>
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
            <Button type="button" variant="secondary" onClick={dismiss}>
              Close
            </Button>
          </div>
        </div>
      );
    }
  }

  // Show the pill whenever a run is live/finished but the dialog is closed.
  const minimized = !open && state.kind !== 'confirm';
  const pillTitle =
    state.kind === 'complete'
      ? 'Download complete'
      : state.kind === 'error'
        ? 'Download failed'
        : 'Downloading backup';

  return (
    <>
      <Dialog title="Download backup" open={open} onClose={handleClose}>
        {body}
      </Dialog>
      {minimized ? (
        <div className={darkMode ? 'dark' : ''}>
          <div className="fixed right-4 bottom-4 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={onRequestOpen}
                className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1 text-left"
                title="Show download"
              >
                <div className="flex items-center gap-1.5">
                  <ArrowsPointingOutIcon
                    width={14}
                    className="shrink-0 opacity-60"
                  />
                  <span className="min-w-0 flex-1 truncate">{pillTitle}</span>
                  {pct != null && state.kind === 'downloading' ? (
                    <span className="shrink-0 text-gray-500 tabular-nums dark:text-neutral-400">
                      {Math.round(pct)}%
                    </span>
                  ) : null}
                </div>
                <span className="truncate font-mono text-xs text-gray-500 dark:text-neutral-400">
                  {progress?.outputFilename ?? backupZipName(backup)}
                </span>
                {state.kind === 'downloading' && pct != null ? (
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-700">
                    <div
                      className="h-full rounded-full bg-gray-500 transition-[width] duration-150 dark:bg-neutral-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                ) : null}
              </button>
              <button
                type="button"
                onClick={state.kind === 'downloading' ? cancel : dismiss}
                className="shrink-0 cursor-pointer rounded p-0.5 opacity-60 hover:opacity-100"
                title={
                  state.kind === 'downloading' ? 'Cancel download' : 'Dismiss'
                }
              >
                <XMarkIcon width={16} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

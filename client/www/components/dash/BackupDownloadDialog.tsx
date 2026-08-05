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

import {
  BackupsManager,
  backupZipName,
  estimateZipSize,
  toAppBackup,
  type AppBackup,
  type BackupDownloadProgress,
} from '@instantdb/platform';

import config from '@/lib/config';
import { messageFromInstantError } from '@/lib/errors';
import { InstantApp, InstantAppBackup, InstantIssue } from '@/lib/types';

import { Button, Content, Dialog, SubsectionHeading } from '@/components/ui';

import { formatTimestamp } from '@/components/dash/shared';
import { useDarkMode } from '@/components/dash/DarkModeToggle';

type DownloadProgress = BackupDownloadProgress & {
  // The picker-chosen destination name, folded into progress so the dialog
  // and pill can label where the zip is going.
  outputFilename: string;
};

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

type DownloadResult =
  | { via: 'picker'; filename: string }
  | { via: 'browser-default'; filename: string };

type SaveFileHandle = Awaited<
  ReturnType<typeof import('native-file-system-adapter').showSaveFilePicker>
>;

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
  backup: AppBackup,
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

  // The dash token can't refresh mid-download, so withAuth just supplies it.
  const manager = new BackupsManager({
    appId,
    apiURI: config.apiURI,
    withAuth: (operation) => operation(token),
  });

  const outputFilename = pickerHandle?.name ?? filename;
  const writable = await pickerHandle.createWritable();

  // The shared pipeline owns ordering, progress, backpressure, and teardown;
  // this call supplies the browser-specific pieces. The caller's
  // AbortController reaches every fetch the pipeline makes — the caller
  // aborts it externally (e.g. cancel) and the pipeline tears everything
  // down itself on failure, so the discovery stream stops pulling from S3
  // either way.
  await manager.downloadArchive({
    backup,
    // The entity shards' `Content-Encoding: zstd` is decoded transparently
    // by the browser's fetch.
    fetchBody: async (url, signal) => {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res.body!;
    },
    sink: writable,
    createWriter: async (sink, signal) => {
      // Load the zip encoder on demand (kept out of the shared bundle).
      const { ZipWriter } = await import('@zip.js/zip.js');
      // zip64: without it any archive whose central-directory offset passes
      // 4GB writes a wrapped 32-bit offset and the zip is unreadable.
      // Everything else is left at zip.js's defaults: workers +
      // CompressionStream when available (compression and CRC32 run off the
      // main thread so a multi-GB backup doesn't jank the tab), each
      // degrading to an inline main-thread codec on browsers that lack them —
      // correctness (incl. zip64) is unaffected either way.
      return new ZipWriter(sink, { zip64: true, signal });
    },
    signal: abortController.signal,
    onProgress: (p) => setProgress({ ...p, outputFilename }),
  });
  return { via: 'picker', filename: pickerHandle.name ?? filename };
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
  // The dash API hands us the raw server row; the platform helpers
  // (downloadArchive, backupZipName, estimateZipSize) take the parsed shape.
  const appBackup = useMemo(() => toAppBackup(backup), [backup]);
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
  const [pickerError, setPickerError] = useState(false);
  const loadPicker = useCallback(() => {
    setPickerError(false);
    Promise.all([
      import('native-file-system-adapter').then((m) => {
        pickerRef.current = m.showSaveFilePicker;
      }),
      // Register the fallback's service worker up front (no-op on Chromium) so
      // it's active before we write, rather than installing it in the hot path.
      registerDownloadServiceWorker(),
    ])
      .then(() => setPickerReady(true))
      .catch((e) => {
        // A rejected import / SW registration would otherwise leave the button
        // permanently disabled (and surface as an unhandled rejection). Flag it
        // so the user gets a retry instead of a dead button.
        console.error('Failed to prepare backup download', e);
        setPickerError(true);
      });
  }, []);
  useEffect(() => {
    loadPicker();
  }, [loadPicker]);

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

  const sizeEstimate = estimateZipSize(appBackup);

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
        appBackup,
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
        {sizeEstimate ? (
          <Content>
            The zip file will be between{' '}
            <strong>{formatBytes(sizeEstimate.min)}</strong> and{' '}
            <strong>{formatBytes(sizeEstimate.max)}</strong>, depending on the
            compression ratio.
          </Content>
        ) : null}
        {pickerError ? (
          <Content className="text-red-600 dark:text-red-400">
            Couldn't prepare the download. Please retry.
          </Content>
        ) : null}
        <div className="flex flex-row gap-2">
          {pickerError ? (
            <Button type="button" variant="primary" onClick={loadPicker}>
              Retry
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={start}
              disabled={!pickerReady}
            >
              Download
            </Button>
          )}
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
            {formatBytes(progress?.zipBytes ?? 0)}
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
                  {progress?.outputFilename ?? backupZipName(appBackup)}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {formatBytes(progress?.zipBytes ?? 0)}
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
                  {progress?.outputFilename ?? backupZipName(appBackup)}
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

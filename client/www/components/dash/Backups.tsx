import {
  FormEvent,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDownTrayIcon,
  CommandLineIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Transition } from '@headlessui/react';

import config from '@/lib/config';
import { useAuthedFetch } from '@/lib/auth';
import { jsonFetch, jsonMutate } from '@/lib/fetch';
import { errorToast, successToast } from '@/lib/toast';
import { TokenContext } from '@/lib/contexts';
import { InstantApp, InstantAppBackup, InstantAppBackupJob } from '@/lib/types';

import {
  Button,
  Content,
  Dialog,
  Label,
  SectionHeading,
  SubsectionHeading,
  TextInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useDialog,
} from '@/components/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/DropdownMenu';
import {
  ErrorMessage,
  Loading,
  formatTimestamp,
} from '@/components/dash/shared';
import { CopyableText } from '@/components/dash/Webhooks';
import { useBackupDownloads } from '@/components/dash/BackupDownloadDialog';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/components/ui/item';

function createBackup(token: string, appId: string, description?: string) {
  return jsonMutate<{ job: InstantAppBackupJob }>(
    `${config.apiURI}/dash/apps/${appId}/backups`,
    { token, body: description ? { description } : {} },
  );
}

function fetchBackupJob(token: string, appId: string, jobId: string) {
  return jsonFetch(`${config.apiURI}/dash/apps/${appId}/backup-jobs/${jobId}`, {
    headers: { authorization: `Bearer ${token}` },
  }) as Promise<{ job: InstantAppBackupJob | null }>;
}

function cancelBackupJob(token: string, appId: string, jobId: string) {
  return jsonMutate<{ id: string }>(
    `${config.apiURI}/dash/apps/${appId}/backup-jobs/${jobId}`,
    { token, method: 'DELETE' },
  );
}

// Shared layout for both in-progress jobs and finished backups. Rendering them
// through one component with the same structure (title, optional description, a
// two-row detail grid, and an action) keeps the row the exact same size, so it
// doesn't reflow when a job finishes and becomes a backup.
function BackupItem({
  title,
  description,
  rows,
  action,
  corner,
}: {
  title: string;
  description?: string | null;
  rows: [string, ReactNode][];
  action: ReactNode;
  corner?: ReactNode;
}) {
  return (
    <Item
      variant="outline"
      className="group relative bg-white dark:border-neutral-700 dark:bg-neutral-800"
    >
      {corner ? <div className="absolute top-2 right-2">{corner}</div> : null}
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {description ? <ItemDescription>{description}</ItemDescription> : null}
        <dl className="grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-neutral-500">
          {rows.map(([label, value]) => [
            <dt key={`${label}-dt`}>{label}</dt>,
            <dd key={`${label}-dd`}>{value}</dd>,
          ])}
        </dl>
      </ItemContent>
      <ItemActions>{action}</ItemActions>
    </Item>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-gray-200 dark:bg-neutral-800">
      <div
        className="h-full rounded-full bg-gray-500 transition-[width] duration-150 dark:bg-neutral-400"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BackupJobRow({
  app,
  job,
  onCancelled,
}: {
  app: InstantApp;
  job: InstantAppBackupJob;
  onCancelled: () => void;
}) {
  const token = useContext(TokenContext);
  const confirmDialog = useDialog();
  const [cancelling, setCancelling] = useState(false);
  const completed = job.work_completed ?? 0;
  // Pad the estimate by 10% so the bar doesn't sit at 100% while the backup
  // finishes uploading and finalizing.
  const estimate = Math.round((job.work_estimate ?? 0) * 1.1);
  const pct =
    estimate > 0
      ? Math.min(100, Math.round((completed / estimate) * 100))
      : null;
  const label = job.job_status === 'waiting' ? 'Starting…' : 'Backing up…';

  async function onCancel() {
    if (!token) return;
    setCancelling(true);
    try {
      await cancelBackupJob(token, app.id, job.id);
      successToast('Backup cancelled.');
      confirmDialog.onClose();
      // The server drops the job from the active list immediately, so refetch to
      // clear the row (a running worker aborts at its next progress checkpoint).
      onCancelled();
    } catch (e: any) {
      errorToast(e?.body?.message ?? 'Failed to cancel backup.');
      setCancelling(false);
    }
  }

  return (
    <BackupItem
      title={formatTimestamp(job.created_at)}
      description={job.description}
      rows={[
        ['Status', cancelling ? 'Cancelling…' : label],
        [
          'Progress',
          <div className="flex items-center gap-2">
            <ProgressBar pct={pct ?? 0} />
            {pct !== null ? <span className="tabular-nums">{pct}%</span> : null}
          </div>,
        ],
      ]}
      action={
        <>
          <Button
            variant="secondary"
            size="mini"
            disabled={cancelling}
            onClick={confirmDialog.onOpen}
          >
            Cancel
          </Button>
          <Dialog title="Cancel backup" {...confirmDialog}>
            <div className="flex flex-col gap-4">
              <SubsectionHeading>Cancel backup</SubsectionHeading>
              <Content className="text-sm text-gray-500 dark:text-neutral-500">
                Cancel this backup? Progress so far will be discarded and no
                snapshot will be saved.
              </Content>
              <div className="flex flex-row gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  loading={cancelling}
                  onClick={onCancel}
                >
                  Cancel backup
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={cancelling}
                  onClick={confirmDialog.onClose}
                >
                  Keep backing up
                </Button>
              </div>
            </div>
          </Dialog>
        </>
      }
    />
  );
}

function BackupRow({
  app,
  backup,
  onDeleted,
}: {
  app: InstantApp;
  backup: InstantAppBackup;
  onDeleted: () => void;
}) {
  const token = useContext(TokenContext);
  const { open, active } = useBackupDownloads();
  const deleteDialog = useDialog();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Deleting is admin-only (the server enforces this too); hide the affordance
  // for everyone else.
  const canDelete =
    app.user_app_role === 'admin' || app.user_app_role === 'owner';

  function openDeleteDialog() {
    setDeleteError(null);
    deleteDialog.onOpen();
  }

  // The equivalent `instant-cli backup download` invocation, for scripting or
  // downloading outside the browser. When the dashboard isn't pointed at the
  // CLI's default (production) backend — i.e. dev, staging, or a self-hosted
  // instance — prefix the exact apiURI via INSTANT_CLI_API_URI so the CLI hits
  // the same server this dashboard does.
  const cliDownloadCommand = (() => {
    const cmd = `npx instant-cli@latest backup download ${backup.id} --app ${app.id}`;
    return config.apiURI === 'https://api.instantdb.com'
      ? cmd
      : `INSTANT_CLI_API_URI=${config.apiURI} ${cmd}`;
  })();

  async function copyCliDownloadCommand() {
    try {
      await window.navigator.clipboard.writeText(cliDownloadCommand);
      successToast('Copied CLI download command.');
    } catch {
      errorToast('Failed to copy to clipboard.');
    }
  }

  async function deleteBackup() {
    if (!token) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await jsonMutate(
        `${config.apiURI}/dash/apps/${app.id}/backups/${backup.id}`,
        { token, method: 'DELETE' },
      );
      deleteDialog.onClose();
      successToast('Backup deleted.');
      onDeleted();
    } catch (e: any) {
      setDeleteError(e?.body?.message ?? 'Failed to delete backup.');
    } finally {
      setDeleting(false);
    }
  }

  const isActive = active?.id === backup.id;
  // Only one download at a time: while another backup is actively downloading,
  // this row's button is disabled with an explanation.
  const blockedByOther = active?.status === 'downloading' && !isActive;
  // Only relabel once the download has actually started (past the confirm
  // dialog) — while confirming it's still just "Download".
  const downloadLabel =
    isActive && active?.status === 'downloading'
      ? 'Downloading…'
      : isActive &&
          (active?.status === 'complete' || active?.status === 'error')
        ? 'Show download'
        : 'Download';

  const downloadButton = (
    <Button
      variant="secondary"
      size="mini"
      disabled={blockedByOther}
      // pointer-events-none so hover falls through to the wrapping tooltip
      // trigger below — a disabled button emits no pointer events itself.
      className={blockedByOther ? 'pointer-events-none' : undefined}
      onClick={blockedByOther ? undefined : () => open(app, backup, token)}
    >
      <ArrowDownTrayIcon width={14} /> {downloadLabel}
    </Button>
  );

  // Hidden until the row is hovered (or the menu is open/focused), so it stays
  // out of the way until you go looking for it.
  const actionsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Backup actions"
        className="cursor-pointer rounded p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-600 focus-visible:opacity-100 data-[state=open]:opacity-100 dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        <EllipsisVerticalIcon width={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={copyCliDownloadCommand}
        >
          <CommandLineIcon width={14} /> Copy CLI download command
        </DropdownMenuItem>
        {canDelete ? (
          <>
            <DropdownMenuSeparator className="bg-gray-200 dark:bg-neutral-700" />
            <DropdownMenuItem
              className="cursor-pointer text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              onSelect={openDeleteDialog}
            >
              <TrashIcon
                width={14}
                className="text-red-600 dark:text-red-400"
              />{' '}
              Delete backup
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <BackupItem
        title={formatTimestamp(backup.backup_at)}
        description={backup.description}
        rows={[
          [
            'Expires',
            backup.expires_at ? formatTimestamp(backup.expires_at) : '—',
          ],
          [
            'ID',
            <CopyableText value={backup.id} className="font-mono break-all" />,
          ],
        ]}
        action={
          blockedByOther ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-not-allowed">
                  {downloadButton}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                You can only download one backup at a time.
              </TooltipContent>
            </Tooltip>
          ) : (
            downloadButton
          )
        }
        corner={actionsMenu}
      />
      <Dialog title="Delete backup" {...deleteDialog}>
        <div className="flex flex-col gap-3">
          <SubsectionHeading>Delete backup</SubsectionHeading>
          <Content className="text-sm text-gray-500 dark:text-neutral-500">
            This removes the backup from your dashboard and can't be undone.
          </Content>
          {deleteError ? (
            <div className="rounded-sm bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {deleteError}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="destructive"
              loading={deleting}
              onClick={deleteBackup}
            >
              Delete backup
            </Button>
            <Button variant="secondary" onClick={deleteDialog.onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function Backups({ app }: { app: InstantApp }) {
  const token = useContext(TokenContext);
  const createDialog = useDialog();
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Retains the message while the error box fades out (createError is null
  // during the leave transition), so it doesn't blank before it's gone.
  const lastCreateError = useRef('');

  function openCreateDialog() {
    setCreateError(null);
    createDialog.onOpen();
  }

  const backupsRes = useAuthedFetch<{
    backups: InstantAppBackup[];
  }>(`${config.apiURI}/dash/apps/${app.id}/backups`);

  const jobsRes = useAuthedFetch<{
    jobs: InstantAppBackupJob[];
  }>(`${config.apiURI}/dash/apps/${app.id}/backup-jobs`);

  const jobs = jobsRes.data?.jobs ?? [];
  const activeCount = jobs.length;
  const hasActive = activeCount > 0;
  const jobIds = jobs.map((j) => j.id);
  const jobIdsKey = jobIds.join(',');

  // While a backup is running, poll the jobs list so progress advances.
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => {
      jobsRes.mutate();
    }, 1000);
    return () => clearInterval(t);
  }, [hasActive, jobsRes.mutate]);

  // Detect when a job we were watching leaves the active list and alert on its
  // outcome. `seenJobIds` starts empty, so we never alert for jobs that were
  // already finished before this component mounted.
  const seenJobIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Rebuild the id set from jobIdsKey (not jobIds) so the effect keys off the
    // stable string and re-runs only when the set of active jobs changes.
    const current = new Set(jobIdsKey ? jobIdsKey.split(',') : []);
    const finished = [...seenJobIds.current].filter((id) => !current.has(id));
    seenJobIds.current = current;
    if (finished.length === 0 || !token) return;
    backupsRes.mutate();
    finished.forEach(async (id) => {
      try {
        const { job } = await fetchBackupJob(token, app.id, id);
        if (job?.job_status === 'completed') {
          successToast('Backup finished.');
        } else if (job?.job_status === 'errored') {
          errorToast('Backup failed.', { autoClose: 8000 });
        }
      } catch {
        // Best-effort alert; ignore lookup failures.
      }
    });
  }, [jobIdsKey, token, app.id, backupsRes.mutate]);

  const backups = useMemo(
    () =>
      (backupsRes.data?.backups ?? []).filter(
        (backup) =>
          backup.expires_at && new Date(backup.expires_at) > new Date(),
      ),
    [backupsRes.data?.backups],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setCreateError(null);
    try {
      const desc = description.trim();
      await createBackup(token, app.id, desc || undefined);
      successToast('Backup started.');
      setDescription('');
      createDialog.onClose();
      jobsRes.mutate();
    } catch (e: any) {
      // Show the error (e.g. rate limit, too-large app) inline in the dialog so
      // it stays put next to the form instead of flashing by as a toast.
      const msg = e?.body?.message ?? 'Failed to start backup.';
      lastCreateError.current = msg;
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }

  if (backupsRes.isLoading) return <Loading />;
  if (backupsRes.error) {
    return <ErrorMessage>Failed to load backups.</ErrorMessage>;
  }

  const createButton = (
    <Button
      variant="primary"
      size="mini"
      disabled={hasActive}
      className={hasActive ? 'pointer-events-none' : undefined}
      onClick={openCreateDialog}
    >
      <PlusIcon width={14} /> Create backup
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading>Backups</SectionHeading>
          <Content className="text-sm text-gray-500 dark:text-neutral-500">
            Point-in-time snapshots of your app's data.
          </Content>
        </div>
        {hasActive ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-not-allowed">
                {createButton}
              </span>
            </TooltipTrigger>
            <TooltipContent>A backup is already in progress.</TooltipContent>
          </Tooltip>
        ) : (
          createButton
        )}
      </div>

      {jobs.length === 0 && backups.length === 0 ? (
        <div className="rounded-sm border bg-gray-50 p-8 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-500">
          No backups yet.
        </div>
      ) : (
        <ItemGroup className="gap-2">
          {jobs.map((job) => (
            <BackupJobRow
              key={job.id}
              app={app}
              job={job}
              onCancelled={() => jobsRes.mutate()}
            />
          ))}
          {backups.map((b) => (
            <BackupRow
              key={b.id}
              app={app}
              backup={b}
              onDeleted={() => backupsRes.mutate()}
            />
          ))}
        </ItemGroup>
      )}

      <Dialog title="Create backup" {...createDialog}>
        <form onSubmit={onCreate} className="flex flex-col gap-4">
          <SubsectionHeading>Create backup</SubsectionHeading>
          <Content className="text-sm text-gray-500 dark:text-neutral-500">
            Take a point-in-time snapshot of your app's data. Large apps can
            take a while.
          </Content>
          <div className="flex flex-col gap-1">
            <Label>Description (optional)</Label>
            <TextInput
              autoFocus
              value={description}
              onChange={setDescription}
              placeholder="e.g. Before migration"
            />
          </div>
          <Transition
            as="div"
            show={!!createError}
            className="overflow-hidden rounded-sm bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
            enter="transition-all duration-300 ease-out"
            enterFrom="opacity-0 -translate-y-1 max-h-0 p-0!"
            enterTo="opacity-100 translate-y-0 max-h-40"
            leave="transition-all duration-200 ease-in"
            leaveFrom="opacity-100 translate-y-0 max-h-40"
            leaveTo="opacity-0 -translate-y-1 max-h-0 p-0!"
          >
            {createError ?? lastCreateError.current}
          </Transition>
          <div className="flex flex-row gap-2">
            <Button type="submit" variant="primary" loading={creating}>
              Create backup
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={createDialog.onClose}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

import {
  FormEvent,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowDownTrayIcon, PlusIcon } from '@heroicons/react/24/outline';
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

// Shared layout for both in-progress jobs and finished backups. Rendering them
// through one component with the same structure (title, optional description, a
// two-row detail grid, and an action) keeps the row the exact same size, so it
// doesn't reflow when a job finishes and becomes a backup.
function BackupItem({
  title,
  description,
  rows,
  action,
}: {
  title: string;
  description?: string | null;
  rows: [string, ReactNode][];
  action: ReactNode;
}) {
  return (
    <Item
      variant="outline"
      className="bg-white dark:border-neutral-700 dark:bg-neutral-800"
    >
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

function BackupJobRow({ job }: { job: InstantAppBackupJob }) {
  const completed = job.work_completed ?? 0;
  // Pad the estimate by 10% so the bar doesn't sit at 100% while the backup
  // finishes uploading and finalizing.
  const estimate = Math.round((job.work_estimate ?? 0) * 1.1);
  const pct =
    estimate > 0
      ? Math.min(100, Math.round((completed / estimate) * 100))
      : null;
  const label = job.job_status === 'waiting' ? 'Starting…' : 'Backing up…';

  return (
    <BackupItem
      title={formatTimestamp(job.created_at)}
      description={job.description}
      rows={[
        ['Status', label],
        ['Progress', <ProgressBar pct={pct ?? 0} />],
      ]}
      action={
        <span className="text-sm text-gray-500 tabular-nums dark:text-neutral-500">
          {pct !== null ? `${pct}%` : ''}
        </span>
      }
    />
  );
}

function BackupRow({
  app,
  backup,
}: {
  app: InstantApp;
  backup: InstantAppBackup;
}) {
  const token = useContext(TokenContext);
  const { open, active } = useBackupDownloads();

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

  return (
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
    />
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

  // While a backup is running, poll both the jobs and the backups list so
  // progress advances and the finished snapshot shows up.
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => {
      jobsRes.mutate();
      backupsRes.mutate();
    }, 1000);
    return () => clearInterval(t);
  }, [hasActive, jobsRes.mutate, backupsRes.mutate]);

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
          errorToast(job.error ?? 'Backup failed.', { autoClose: 8000 });
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
            <BackupJobRow key={job.id} job={job} />
          ))}
          {backups.map((b) => (
            <BackupRow key={b.id} app={app} backup={b} />
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

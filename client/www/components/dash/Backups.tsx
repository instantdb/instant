import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import { formatDuration, intervalToDuration } from 'date-fns';
import { motion, useSpring, useTransform } from 'motion/react';

import config from '@/lib/config';
import { TokenContext } from '@/lib/contexts';
import { useAuthedFetch } from '@/lib/auth';
import { jsonFetch } from '@/lib/fetch';
import { messageFromInstantError } from '@/lib/errors';
import { errorToast, successToast } from '@/lib/toast';
import {
  InstantApp,
  InstantAppBackup,
  InstantAppRestoreJob,
  InstantIssue,
} from '@/lib/types';

import {
  Button,
  Content,
  Dialog,
  Label,
  SectionHeading,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import {
  ErrorMessage,
  Loading,
  formatTimestamp,
} from '@/components/dash/shared';
import { CopyableText } from '@/components/dash/Webhooks';
import { DownloadDialog } from '@/components/dash/BackupDownloadDialog';
import { RollingNumber } from '@/components/RollingNumber';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/components/ui/item';

function reportError(e: unknown, fallback: string) {
  console.error(e);
  const msg = messageFromInstantError(e as InstantIssue) || fallback;
  errorToast(msg, { autoClose: 5000 });
}

type RestoreJob = {
  id: string;
  app_backup_id: string;
  source_app_id: string;
  dest_app_id?: string;
  work_estimate: number | null;
  work_completed: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  // Cap at 1 year — anything beyond is useless to display and
  // intervalToDuration throws "Invalid Date" past Date's max (~285k years).
  const safeMs = Math.min(ms, 365 * 24 * 60 * 60 * 1000);
  const duration = intervalToDuration({ start: 0, end: safeMs });
  const formatted =
    formatDuration(duration, { format: ['hours', 'minutes'] }) ||
    'less than a minute';
  return `~ ${formatted} remaining`;
}

function useRestoreMetrics(job: InstantAppRestoreJob | null) {
  const samplesRef = useRef<{ time: number; done: number }[]>([]);
  const holtRef = useRef<{
    level: number | null;
    trend: number;
    time: number;
    done: number;
    updates: number;
  } | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [etaSec, setEtaSec] = useState<number | null>(null);

  useEffect(() => {
    if (!job || job.completed_at) {
      samplesRef.current = [];
      holtRef.current = null;
      setRate(null);
      setEtaSec(null);
      return;
    }
    // Use the server's updated_at — that's the moment work_completed was
    // actually written. Using Date.now() conflates network/processing latency
    // into dt and inflates the rate.
    const obsTime = new Date(job.updated_at).getTime();
    const done = job.work_completed ?? 0;
    const total = job.work_estimate ?? 0;
    const remaining = total - done;
    const cutoff = obsTime - 30_000;
    const samples = [
      ...samplesRef.current.filter((s) => s.time >= cutoff),
      { time: obsTime, done },
    ];
    samplesRef.current = samples;

    // Compute rate only from samples[1..] (the initial sample is a snapshot
    // over an unknown interval), with at least 2 updates AND a minimum 5s
    // window. The 5s floor matters because polling backs off as fast as 1s —
    // computing rate over a single 1s interval magnifies bursts/lulls into
    // wild spikes on first load.
    const MIN_WINDOW_MS = 5_000;
    if (samples.length >= 3) {
      const first = samples[1];
      const last = samples[samples.length - 1];
      const dtMs = last.time - first.time;
      const delta = last.done - first.done;
      setRate(
        dtMs >= MIN_WINDOW_MS && delta > 0 ? delta / (dtMs / 1000) : null,
      );
    } else {
      setRate(null);
    }

    // Holt: same idea — don't seed `level` from an instRate measured over
    // less than the minimum window, otherwise a fast first poll bakes in a
    // huge initial level that takes minutes to relax through smoothing.
    const tauLevel = 120;
    const tauTrend = 300;
    const prevHolt = holtRef.current;
    if (!prevHolt) {
      holtRef.current = {
        level: null,
        trend: 0,
        time: obsTime,
        done,
        updates: 0,
      };
      setEtaSec(null);
      return;
    }
    const dtSec = (obsTime - prevHolt.time) / 1000;
    const deltaDone = done - prevHolt.done;
    if (dtSec <= 0 || deltaDone < 0) return;
    const updates = prevHolt.updates + 1;
    if (updates < 2) {
      // First update — discard its instRate, just advance position.
      holtRef.current = { level: null, trend: 0, time: obsTime, done, updates };
      setEtaSec(null);
      return;
    }
    const instRate = deltaDone / dtSec;
    if (prevHolt.level == null) {
      // Wait until the seed instRate spans the minimum window. Keep prevHolt
      // anchored so dtSec grows on the next observation.
      if (dtSec * 1000 < MIN_WINDOW_MS) {
        setEtaSec(null);
        return;
      }
      holtRef.current = {
        level: instRate,
        trend: 0,
        time: obsTime,
        done,
        updates,
      };
      setEtaSec(null);
      return;
    }
    const alpha = 1 - Math.exp(-dtSec / tauLevel);
    const beta = 1 - Math.exp(-dtSec / tauTrend);
    const level =
      alpha * instRate +
      (1 - alpha) * (prevHolt.level + prevHolt.trend * dtSec);
    const trend =
      beta * ((level - prevHolt.level) / dtSec) + (1 - beta) * prevHolt.trend;
    holtRef.current = { level, trend, time: obsTime, done, updates };
    const safeLevel = Math.max(level, 1e-9);
    setEtaSec(remaining > 0 ? remaining / safeLevel : null);
  }, [job?.id, job?.work_completed, job?.completed_at]);

  return { rate, etaSec };
}

function ProgressBar({ pct }: { pct: number | null }) {
  const value = pct ?? 0;
  const spring = useSpring(value, { stiffness: 80, damping: 20 });
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  const width = useTransform(
    spring,
    (v) => `${Math.max(0, Math.min(100, v))}%`,
  );
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-neutral-700">
      <motion.div
        className="h-full bg-emerald-500 dark:bg-emerald-400"
        style={{ width }}
      />
    </div>
  );
}

async function startRestore(
  token: string,
  appId: string,
  backupId: string,
  title: string,
): Promise<RestoreJob> {
  const { job } = (await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/backups/${backupId}/restore`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title }),
    },
  )) as { job: RestoreJob };
  return job;
}

async function fetchRestoreJob(
  token: string,
  appId: string,
  backupId: string,
  jobId: string,
): Promise<RestoreJob> {
  const { job } = (await jsonFetch(
    `${config.apiURI}/dash/apps/${appId}/backups/${backupId}/restore/${jobId}`,
    { headers: { authorization: `Bearer ${token}` } },
  )) as { job: RestoreJob };
  return job;
}

function RestoreDialog({
  app,
  backup,
  dialog,
  job,
  onStarted,
  onRestoreStarted,
}: {
  app: InstantApp;
  backup: InstantAppBackup;
  dialog: ReturnType<typeof useDialog>;
  job: RestoreJob | null;
  onStarted: (job: RestoreJob) => void;
  onRestoreStarted?: () => void;
}) {
  const token = useContext(TokenContext);
  const [title, setTitle] = useState(() => `${app.title} (restored)`);
  const [isLoading, setIsLoading] = useState(false);

  const { rate, etaSec: holtEtaSec } = useRestoreMetrics(job);

  const handle = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      errorToast('Title is required.', { autoClose: 5000 });
      return;
    }
    setIsLoading(true);
    try {
      const started = await startRestore(token, app.id, backup.id, trimmed);
      onStarted(started);
      onRestoreStarted?.();
      successToast('Restore started.');
    } catch (e) {
      reportError(e, 'Failed to start restore.');
    } finally {
      setIsLoading(false);
    }
  };

  let body;
  if (!job) {
    body = (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handle();
        }}
        className="flex flex-col gap-4"
      >
        <SubsectionHeading>Restore backup</SubsectionHeading>
        <Content>
          Restoring creates a new app containing all of the data from{' '}
          <strong>{app.title}</strong> as of {formatTimestamp(backup.backup_at)}
          . The original app is left untouched. Depending on the size of the
          backup this may take a few minutes.
        </Content>
        <div className="flex flex-col gap-1">
          <Label>New app title</Label>
          <TextInput
            autoFocus
            value={title}
            onChange={setTitle}
            placeholder={`${app.title} (restored)`}
          />
        </div>
        <div className="flex flex-row gap-2">
          <Button type="submit" variant="primary" loading={isLoading}>
            Restore
          </Button>
          <Button type="button" variant="secondary" onClick={dialog.onClose}>
            Cancel
          </Button>
        </div>
      </form>
    );
  } else if (!job.completed_at) {
    const total = job.work_estimate ?? 0;
    const done = job.work_completed ?? 0;
    const pct =
      total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
    const elapsedMs = Date.now() - new Date(job.created_at).getTime();
    const eta =
      elapsedMs >= 30_000 && holtEtaSec != null
        ? formatEta(holtEtaSec * 1000)
        : null;
    body = (
      <div className="flex flex-col gap-4">
        <SubsectionHeading>Restoring backup</SubsectionHeading>
        <Content>
          Restoring backup of <strong>{app.title}</strong> taken{' '}
          {formatTimestamp(backup.backup_at)}.
        </Content>
        <Content>
          You can close this dialog, the restore will continue in the
          background.
        </Content>
        <div className="flex flex-col gap-2">
          <ProgressBar pct={pct} />
          <div className="flex items-baseline justify-between gap-2 text-xs text-gray-500 dark:text-neutral-500">
            <span className="tabular-nums">
              <RollingNumber value={done} format={(n) => n.toLocaleString()} />
              {' / '}
              <RollingNumber value={total} format={(n) => n.toLocaleString()} />
              {' entities'}
              {pct == null ? '' : ` (${pct}%)`}
              {rate != null ? (
                <>
                  {' · '}
                  <RollingNumber
                    value={Math.round(rate)}
                    format={(n) => n.toLocaleString()}
                  />
                  {'/sec'}
                </>
              ) : null}
            </span>
            <span>{eta ?? ''}</span>
          </div>
        </div>
        <div>
          <Button type="button" variant="secondary" onClick={dialog.onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <SubsectionHeading>Restore complete</SubsectionHeading>
        <Content>
          A new app has been created with all of the data from{' '}
          <strong>{app.title}</strong> as of {formatTimestamp(backup.backup_at)}
          .
        </Content>
        {job.dest_app_id ? (
          <div className="flex flex-col gap-1">
            <Label>New app ID</Label>
            <CopyableText
              value={job.dest_app_id}
              className="font-mono text-xs break-all"
            />
          </div>
        ) : null}
        <div className="flex flex-row gap-2">
          {job.dest_app_id ? (
            <Button
              type="link"
              href={`/dash?s=main&app=${job.dest_app_id}`}
              variant="primary"
            >
              Open restored app
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={dialog.onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Dialog title="Restore backup" {...dialog}>
      {body}
    </Dialog>
  );
}

function BackupRow({
  app,
  backup,
  onRestoreStarted,
}: {
  app: InstantApp;
  backup: InstantAppBackup;
  onRestoreStarted?: () => void;
}) {
  const token = useContext(TokenContext);
  const [restoreJob, setRestoreJob] = useState<RestoreJob | null>(null);
  const restoreDialog = useDialog();
  const downloadDialog = useDialog();

  // Poll the restore job until it completes. Keeps running even when the
  // dialog is closed, so reopening shows the latest state. Polls quickly
  // while work_completed is advancing, then backs off (doubling, capped at
  // 30s) once progress stalls.
  useEffect(() => {
    if (!restoreJob || restoreJob.completed_at) return;

    const minDelay = 1000;
    const maxDelay = 30000;
    let cancelled = false;
    let timeoutId: number | null = null;
    let delay = minDelay;
    let prevWork = restoreJob.work_completed ?? 0;

    const schedule = () => {
      timeoutId = window.setTimeout(tick, delay);
    };

    const tick = async () => {
      try {
        const next = await fetchRestoreJob(
          token,
          app.id,
          backup.id,
          restoreJob.id,
        );
        if (cancelled) return;
        const nextWork = next.work_completed ?? 0;
        delay = nextWork > prevWork ? minDelay : Math.min(maxDelay, delay * 2);
        prevWork = nextWork;
        setRestoreJob(next);
        if (!next.completed_at) schedule();
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        delay = Math.min(maxDelay, delay * 2);
        schedule();
      }
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [restoreJob?.id, restoreJob?.completed_at, token, app.id, backup.id]);

  return (
    <Item
      variant="outline"
      className="bg-white dark:border-neutral-700 dark:bg-neutral-800"
    >
      <ItemContent>
        <ItemTitle>{formatTimestamp(backup.backup_at)}</ItemTitle>
        {backup.description ? (
          <ItemDescription>{backup.description}</ItemDescription>
        ) : null}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-neutral-500">
          {backup.expires_at ? (
            <>
              <dt>Expires</dt>
              <dd>{formatTimestamp(backup.expires_at)}</dd>
            </>
          ) : null}
          <dt>ID</dt>
          <dd>
            <CopyableText value={backup.id} className="font-mono break-all" />
          </dd>
        </dl>
      </ItemContent>
      <ItemActions>
        <Button variant="secondary" size="mini" onClick={downloadDialog.onOpen}>
          <ArrowDownTrayIcon width={14} /> Download
        </Button>
        <Button variant="secondary" size="mini" onClick={restoreDialog.onOpen}>
          <ArrowUturnLeftIcon width={14} /> Restore
        </Button>
      </ItemActions>
      <DownloadDialog app={app} backup={backup} dialog={downloadDialog} />
      <RestoreDialog
        app={app}
        backup={backup}
        dialog={restoreDialog}
        job={restoreJob}
        onStarted={setRestoreJob}
        onRestoreStarted={onRestoreStarted}
      />
    </Item>
  );
}

function RestoreItem({
  restore,
  backup,
}: {
  restore: InstantAppRestoreJob;
  backup: InstantAppBackup | undefined;
}) {
  const { rate, etaSec } = useRestoreMetrics(restore);
  const total = restore.work_estimate ?? 0;
  const done = restore.work_completed ?? 0;
  const pct =
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : null;
  const isComplete = !!restore.completed_at;
  const elapsedMs = Date.now() - new Date(restore.created_at).getTime();
  const eta =
    !isComplete && elapsedMs >= 30_000 && etaSec != null
      ? formatEta(etaSec * 1000)
      : null;

  return (
    <Item
      variant="outline"
      className="bg-white dark:border-neutral-700 dark:bg-neutral-800"
    >
      <ItemContent>
        <ItemTitle>
          {isComplete ? 'Restore complete' : 'Restoring backup'}
        </ItemTitle>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-neutral-500">
          <dt>Started</dt>
          <dd>{formatTimestamp(restore.created_at)}</dd>
          {isComplete && restore.completed_at ? (
            <>
              <dt>Finished</dt>
              <dd>{formatTimestamp(restore.completed_at)}</dd>
            </>
          ) : null}
          <dt>Backup</dt>
          <dd>{backup?.description ?? 'Unknown backup'}</dd>
          {backup ? (
            <>
              <dt>Snapshot at</dt>
              <dd>{formatTimestamp(backup.backup_at)}</dd>
            </>
          ) : null}
          <dt>Backup ID</dt>
          <dd>
            <CopyableText
              value={restore.app_backup_id}
              className="font-mono break-all"
            />
          </dd>
          {isComplete && restore.dest_app_id ? (
            <>
              <dt>New app ID</dt>
              <dd>
                <CopyableText
                  value={restore.dest_app_id}
                  className="font-mono break-all"
                />
              </dd>
            </>
          ) : null}
        </dl>
        {!isComplete ? (
          <div className="flex flex-col gap-2 pt-1">
            <ProgressBar pct={pct} />
            <div className="flex items-baseline justify-between gap-2 text-xs text-gray-500 dark:text-neutral-500">
              <span className="tabular-nums">
                <RollingNumber
                  value={done}
                  format={(n) => n.toLocaleString()}
                />
                {' / '}
                <RollingNumber
                  value={total}
                  format={(n) => n.toLocaleString()}
                />
                {' entities'}
                {pct == null ? '' : ` (${pct}%)`}
                {rate != null ? (
                  <>
                    {' · '}
                    <RollingNumber
                      value={Math.round(rate)}
                      format={(n) => n.toLocaleString()}
                    />
                    {'/sec'}
                  </>
                ) : null}
              </span>
              <span>{eta ?? ''}</span>
            </div>
          </div>
        ) : null}
      </ItemContent>
      {isComplete && restore.dest_app_id ? (
        <ItemActions>
          <Button
            type="link"
            size="mini"
            variant="secondary"
            href={`/dash?s=main&app=${restore.dest_app_id}`}
          >
            Open restored app
          </Button>
        </ItemActions>
      ) : null}
    </Item>
  );
}

export function Backups({ app }: { app: InstantApp }) {
  const backupsRes = useAuthedFetch<{
    backups: InstantAppBackup[];
  }>(`${config.apiURI}/dash/apps/${app.id}/backups`);
  const restoresRes = useAuthedFetch<{
    restores: InstantAppRestoreJob[];
  }>(`${config.apiURI}/dash/apps/${app.id}/restores`);

  const backups = useMemo(
    () =>
      [...(backupsRes.data?.backups ?? [])].sort((a, b) =>
        b.backup_at.localeCompare(a.backup_at),
      ),
    [backupsRes.data?.backups],
  );

  const restores = useMemo(
    () => restoresRes.data?.restores ?? [],
    [restoresRes.data?.restores],
  );

  const backupsById = useMemo(() => {
    const map = new Map<string, InstantAppBackup>();
    for (const b of backups) map.set(b.id, b);
    return map;
  }, [backups]);

  // Poll the restores list with the same adaptive backoff the dialog uses:
  // start at 1s, double up to 30s when nothing has advanced, snap back to 1s
  // the moment ANY in-progress restore's work_completed moves forward.
  const hasInProgress = restores.some((r) => !r.completed_at);
  const restoresMutate = restoresRes.mutate;
  useEffect(() => {
    if (!hasInProgress || !restoresMutate) return;

    const minDelay = 1000;
    const maxDelay = 30000;
    let cancelled = false;
    let timeoutId: number | null = null;
    let delay = minDelay;
    // Snapshot updated each tick. Empty on first tick is fine: any positive
    // work_completed reads as "advanced" and we keep the fast cadence.
    let prevWork = new Map<string, number>();

    const schedule = () => {
      timeoutId = window.setTimeout(tick, delay);
    };

    const tick = async () => {
      try {
        const next = (await restoresMutate()) as
          | { restores: InstantAppRestoreJob[] }
          | undefined;
        if (cancelled) return;
        const list = next?.restores ?? [];
        let advanced = false;
        const newWork = new Map<string, number>();
        for (const r of list) {
          if (r.completed_at) continue;
          const cur = r.work_completed ?? 0;
          const prev = prevWork.get(r.id) ?? 0;
          if (cur > prev) advanced = true;
          newWork.set(r.id, cur);
        }
        prevWork = newWork;
        delay = advanced ? minDelay : Math.min(maxDelay, delay * 2);
        if (list.some((r) => !r.completed_at)) schedule();
      } catch (e) {
        console.error(e);
        if (cancelled) return;
        delay = Math.min(maxDelay, delay * 2);
        schedule();
      }
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [hasInProgress, restoresMutate]);

  if (backupsRes.isLoading) return <Loading />;
  if (backupsRes.error) {
    return <ErrorMessage>Failed to load backups.</ErrorMessage>;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <SectionHeading>Backups</SectionHeading>
        <Content className="text-sm text-gray-500 dark:text-neutral-500">
          Point-in-time snapshots of your app's data.
        </Content>
      </div>

      {backups.length === 0 ? (
        <div className="rounded-sm border bg-gray-50 p-8 text-center text-sm text-gray-500 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-500">
          No backups yet.
        </div>
      ) : (
        <ItemGroup className="gap-2">
          {backups.map((b) => (
            <BackupRow
              key={b.id}
              app={app}
              backup={b}
              onRestoreStarted={restoresMutate}
            />
          ))}
        </ItemGroup>
      )}

      {restores.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SubsectionHeading>Restores</SubsectionHeading>
          <ItemGroup className="gap-2">
            {restores.map((r) => (
              <RestoreItem
                key={r.id}
                restore={r}
                backup={backupsById.get(r.app_backup_id)}
              />
            ))}
          </ItemGroup>
        </div>
      ) : null}
    </div>
  );
}

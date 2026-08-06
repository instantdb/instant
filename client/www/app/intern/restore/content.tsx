'use client';

import { useEffect, useState } from 'react';
import {
  LandingContainer,
  LegacyNav,
  Section,
  H2,
} from '@/components/marketingUi';
import {
  Button,
  Content,
  Dialog,
  FullscreenLoading,
  SubsectionHeading,
  TextInput,
  useDialog,
} from '@/components/ui';
import { Footer } from '@/components/new-landing/Footer';
import { useAdmin, useAuthInfo, useTokenFetch } from '@/lib/auth';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';
import { errorToast, successToast } from '@/lib/toast';
import config from '@/lib/config';

type RestoreJob = {
  id: string;
  app_id: string;
  title: string | null;
  job_status: 'waiting' | 'processing' | 'completed' | 'errored' | 'cancelled';
  progress: string | null;
  error: string | null;
  created_at: string;
  done_at: string | null;
  updated_at: string;
};

const TERMINAL = new Set(['completed', 'errored', 'cancelled']);

// A live restore bumps `updated_at` every second (see report-progress! on the
// server). If a non-terminal job hasn't updated in this long, the machine
// running it probably died/restarted -- the row will never finalize on its own,
// so we surface a "may be stuck" hint and let the operator cancel + retry.
const STALE_MS = 30_000;

function isStale(job: RestoreJob) {
  if (TERMINAL.has(job.job_status)) return false;
  return Date.now() - new Date(job.updated_at).getTime() > STALE_MS;
}

function RestoreDialog({
  token,
  email,
  onStarted,
}: {
  token: string | undefined;
  email: string | undefined;
  onStarted: () => void;
}) {
  const dialog = useDialog();
  const [file, setFile] = useState<File | null>(null);
  const [appId, setAppId] = useState('');
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setErrorMsg('Choose a zip file to restore.');
      return;
    }
    setUploading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (appId.trim()) params.set('app_id', appId.trim());
      if (title.trim()) params.set('title', title.trim());
      const qs = params.toString();

      const res = await fetch(
        `${config.apiURI}/dash/restores/zip${qs ? `?${qs}` : ''}`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/zip',
          },
          body: file,
        },
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message ?? `Restore failed (${res.status})`);
      }
      successToast('Restore started');
      setFile(null);
      setAppId('');
      setTitle('');
      dialog.onClose();
      onStarted();
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Restore failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={dialog.onOpen}>
        Start restore
      </Button>
      <Dialog title="Restore from backup" {...dialog}>
        <div className="flex flex-col gap-4">
          <SubsectionHeading>Restore from backup</SubsectionHeading>
          <Content className="text-sm text-gray-500 dark:text-neutral-500">
            Upload a backup zip to restore the app. The app will have the same
            schema, rules, data, and files as the app that was backed up.
          </Content>
          <Content>
            If you have OAuth client secrets for your social logins, you will
            need to update them from the `Auth` tab after the restore finishes.
          </Content>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Only upload zip files that were downloaded from a valid Instant
            backup.
          </div>
          {email && (
            <Content className="text-sm text-gray-500 dark:text-neutral-500">
              The restored app will be owned by your account (
              <span className="font-medium">{email}</span>).
            </Content>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Backup zip
              </span>
              <label className="flex w-fit cursor-pointer items-center gap-3">
                <span className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-xs hover:bg-gray-50">
                  Choose file
                </span>
                <span className="text-sm text-gray-500">
                  {file ? file.name : 'No file chosen'}
                </span>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                App id (optional)
              </span>
              <TextInput
                value={appId}
                onChange={setAppId}
                placeholder="Leave blank to autogenerate an app id"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">
                Title (optional)
              </span>
              <TextInput
                value={title}
                onChange={setTitle}
                placeholder="Overrides the title from the backup"
              />
            </label>

            {errorMsg && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm break-words whitespace-pre-wrap text-red-700">
                {errorMsg}
              </div>
            )}

            <div>
              <Button
                type="submit"
                variant="primary"
                loading={uploading}
                disabled={!file || uploading}
              >
                {uploading ? 'Uploading…' : 'Start restore'}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}

function statusText(job: RestoreJob) {
  if (job.job_status === 'waiting') return 'Waiting…';
  if (job.job_status === 'processing') return job.progress ?? 'Restoring…';
  return job.job_status;
}

function RecentRestores({
  jobs,
  token,
  onChanged,
}: {
  jobs: RestoreJob[];
  token: string | undefined;
  onChanged: () => void;
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function cancel(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch(`${config.apiURI}/dash/restore-jobs/${id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message ?? `Cancel failed (${res.status})`);
      }
      onChanged();
    } catch (err: any) {
      errorToast(err?.message ?? 'Cancel failed');
    } finally {
      setCancellingId(null);
    }
  }

  if (jobs.length === 0) {
    return <p className="text-sm text-gray-500">No restores yet.</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
      {jobs.map((job) => (
        <div key={job.id} className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col">
              {job.job_status === 'completed' ? (
                <a
                  href={`/dash?app=${job.app_id}`}
                  className="cursor-pointer truncate text-sm font-medium text-blue-600 hover:underline"
                >
                  {job.title || 'Restored app'}
                </a>
              ) : (
                <span className="truncate text-sm font-medium text-gray-700">
                  {job.title || 'Restored app'}
                </span>
              )}
              <span className="truncate text-xs text-gray-500">
                app id: {job.app_id}
              </span>
              <span className="text-xs text-gray-400">
                {new Date(job.created_at).toLocaleString()}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex flex-col items-end">
                <span
                  className={
                    job.job_status === 'errored'
                      ? 'text-xs text-red-600'
                      : job.job_status === 'completed'
                        ? 'text-xs text-green-700'
                        : 'text-xs text-gray-700'
                  }
                >
                  {statusText(job)}
                </span>
                {job.job_status === 'errored' && job.error && (
                  <span className="max-w-xs truncate text-xs text-red-500">
                    {job.error}
                  </span>
                )}
              </div>
              {!TERMINAL.has(job.job_status) && (
                <Button
                  variant="destructive"
                  size="mini"
                  loading={cancellingId === job.id}
                  onClick={() => cancel(job.id)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
          {isStale(job) && (
            <span className="text-xs text-amber-600">
              This job hasn't updated in a while and may be stuck. You can
              cancel it and try again.
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function RestoreContent() {
  const { token, user } = useAuthInfo();

  const restoresRes = useTokenFetch<{ 'restore-jobs': RestoreJob[] }>(
    `${config.apiURI}/dash/restore-jobs`,
    token,
  );
  const jobs = restoresRes.data?.['restore-jobs'] ?? [];
  const anyActive = jobs.some((j) => !TERMINAL.has(j.job_status));

  // Poll the list while any restore is in flight so progress advances.
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(() => restoresRes.mutate(), 1000);
    return () => clearInterval(t);
  }, [anyActive, restoresRes.mutate]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-8">
      <div>
        <H2>Restore from backup</H2>
        <p className="mt-2 text-gray-600">
          Restore an app from a backup zip you downloaded from Instant.
        </p>
      </div>

      <div>
        <RestoreDialog
          token={token}
          email={user?.email}
          onStarted={() => restoresRes.mutate()}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-gray-700">
          Recent restores
        </span>
        <RecentRestores
          jobs={jobs}
          token={token}
          onChanged={() => restoresRes.mutate()}
        />
      </div>
    </div>
  );
}

export default function RestorePage() {
  const isHydrated = useIsHydrated();
  const { isAdmin, isLoading, error } = useAdmin();

  if (!isHydrated || isLoading) {
    return (
      <LandingContainer>
        <LegacyNav />
        <Section>
          <div className="flex min-h-64 items-center justify-center">
            <FullscreenLoading />
          </div>
        </Section>
        <Footer />
      </LandingContainer>
    );
  }

  if (error || !isAdmin) {
    return (
      <LandingContainer>
        <LegacyNav />
        <Section>
          <div className="mt-12 mb-8 text-center">
            <H2>Access Denied</H2>
            <p className="mt-4 text-gray-600">
              You need to be an Instant admin to access this page.
            </p>
          </div>
        </Section>
        <Footer />
      </LandingContainer>
    );
  }

  return (
    <LandingContainer>
      <LegacyNav />
      <Section>
        <RestoreContent />
      </Section>
      <Footer />
    </LandingContainer>
  );
}

/*
TODOs
  1. [DRAFTED] Better explanation of what this does.
       Added intro + dialog copy, but the wording still needs your review.
  2. [DONE] Warn that the zip should be a backup downloaded from Instant.
  3. [DONE] Explain the app is assigned to the signed-in user (shows the email).
  4. [DONE] "Start restore" button opens a dialog with the form.
  5. [BUILT, UNVERIFIED] Show the last N restores (GET /dash/restore-jobs + list).
       Not run end-to-end yet; needs migration 123 applied.
  6. [PARTIAL] Link to the app in the dashboard (/dash?app=<id>).
       Errored restores delete their partial app, so those links 404 --
       should only link when job_status === 'completed'.
  7. [PARTIAL] Show "uploading" while the file uploads.
       Only a button label ("Uploading…") + spinner. No real upload progress --
       fetch() can't report upload %; would need XHR with upload.onprogress.
 */

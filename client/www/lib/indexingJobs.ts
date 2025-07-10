import useSWRSubscription from 'swr/subscription';
import config from './config';
import { CheckedDataType, InstantIndexingJob } from './types';

export async function createJob(
  {
    appId,
    attrId,
    jobType,
    checkedDataType,
  }: {
    appId: string;
    attrId: string;
    jobType: InstantIndexingJob['job_type'];
    checkedDataType?: CheckedDataType | null | undefined;
  },
  token: string,
): Promise<InstantIndexingJob> {
  const res = await fetch(`${config.apiURI}/dash/apps/${appId}/indexing-jobs`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      'app-id': appId,
      'attr-id': attrId,
      'job-type': jobType,
      'checked-data-type': checkedDataType,
    }),
  });

  const json = await res.json();
  return json.job;
}

export function jobFetchLoop(appId: string, jobId: string, token: string) {
  let stopped = false;
  let errored = false;
  let waitMs = 20;
  let lastBody: string | null = null;

  const nextWaitMs = (body: string) => {
    if (body !== lastBody) {
      waitMs = 20;
      lastBody = body;
      return waitMs;
    }
    const ret = waitMs;
    waitMs = Math.min(10000, waitMs * 2);
    return ret;
  };

  const start = async (
    cb: (data: InstantIndexingJob | null, error?: Error) => void,
  ) => {
    while (!stopped && !errored) {
      try {
        const res = await fetch(
          `${config.apiURI}/dash/apps/${appId}/indexing-jobs/${jobId}`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        const body = await res.text();
        const json = JSON.parse(body);
        const job = json.job;
        cb(job);
        if (job.job_status !== 'processing' && job.job_status !== 'waiting') {
          return job;
        }
        await new Promise((resolve) => setTimeout(resolve, nextWaitMs(body)));
      } catch (e) {
        console.error('Job polling error:', e);
        errored = true;
        cb(null, e as Error);
      }
    }
  };

  return {
    start: async (
      cb: (data: InstantIndexingJob | null, error?: Error) => void,
    ): Promise<InstantIndexingJob> => {
      return start(cb);
    },
    stop: () => {
      stopped = true;
    },
  };
}

export function useJobSubscription({
  appId,
  jobId,
  token,
}: {
  appId: string;
  jobId: string;
  token: string;
}) {
  const { data, error } = useSWRSubscription(
    ['jobs', appId, jobId],
    ([_, appId, jobId], { next }) => {
      const fetchLoop = jobFetchLoop(appId, jobId, token);
      fetchLoop.start((data, error) => next(error, data));
      return () => fetchLoop.stop();
    },
  );

  return { data, error };
}

export function jobIsErrored(job: InstantIndexingJob) {
  return job.job_status === 'errored';
}

export function jobIsCompleted(job: InstantIndexingJob) {
  return job.job_status === 'completed' || job.job_status === 'errored';
}

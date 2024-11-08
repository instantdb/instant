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
    jobType: 'check-data-type' | 'remove-data-type';
    checkedDataType?: CheckedDataType | null | undefined;
  },
  token: string,
): Promise<InstantIndexingJob> {
  // XXX: Test different types of errors
  //      1. Job already exists?
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
      console.log('gotChange', 100);
      waitMs = 20;
      lastBody = body;
      return waitMs;
    }
    const ret = waitMs;
    console.log('waitMs', ret);
    waitMs = Math.min(1000, waitMs * 2);
    return ret;
  };

  const start = async (
    cb: (data: InstantIndexingJob | null, error?: Error) => void,
  ) => {
    while (!stopped && !errored) {
      try {
        console.log('fetching');
        const res = await fetch(
          `${config.apiURI}/dash/apps/${appId}/indexing-jobs/${jobId}`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        const body = await res.text();
        const json = JSON.parse(body);
        const job = json.job;
        cb(job);
        console.log('status', job.job_status);
        if (job.job_status !== 'processing' && job.job_status !== 'waiting') {
          console.log('done');
          return job;
        }
        await new Promise((resolve) => setTimeout(resolve, nextWaitMs(body)));
      } catch (e) {
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

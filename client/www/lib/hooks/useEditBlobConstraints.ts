import { useEffect, useState, useRef, useMemo } from 'react';
import { CheckedDataType, InstantIndexingJob, SchemaAttr } from '../types';
import config from '../config';
import { jobFetchLoop } from '../indexingJobs';

type JobConstraintTypes = 'require' | 'index' | 'unique' | 'type';

export type PendingJob = {
  jobType: InstantIndexingJob['job_type'];
  checkedDataType?: CheckedDataType | null | undefined;
};

export const useEditBlobConstraints = ({
  attr,
  appId,
  isRequired,
  isIndexed,
  isUnique,
  checkedDataType,
  token,
}: {
  attr: SchemaAttr;
  appId: string;
  token: string;
  isRequired: boolean;
  isIndexed: boolean;
  isUnique: boolean;
  checkedDataType: CheckedDataType | 'any';
}) => {
  const [pendingJobs, setPendingJobs] = useState<{
    [jobType in JobConstraintTypes]?: PendingJob;
  }>({});

  const [runningjobs, setRunningJobs] = useState<{
    [jobType in JobConstraintTypes]?: InstantIndexingJob;
  }>({});

  const [progress, setProgress] = useState<{ [jobType: string]: number }>({});

  useEffect(() => {
    // If running jobs, don't update any pending
    const isRunning = Object.values(runningjobs).some(
      (job) => job.job_status !== 'completed' && job.job_status !== 'errored',
    );
    if (isRunning) {
      return;
    }

    // Pending requirement job
    if (isRequired === attr.isRequired) {
      setPendingJobs((p) => ({ ...p, require: undefined }));
    } else if (isRequired) {
      setPendingJobs((p) => ({ ...p, require: { jobType: 'required' } }));
    } else if (!isRequired) {
      setPendingJobs((p) => ({
        ...p,
        require: { jobType: 'remove-required' },
      }));
    }

    // Pending index job
    if (isIndexed === attr.isIndex) {
      setPendingJobs((p) => ({ ...p, index: undefined }));
    } else if (isIndexed) {
      setPendingJobs((p) => ({ ...p, index: { jobType: 'index' } }));
    } else if (!isIndexed) {
      setPendingJobs((p) => ({
        ...p,
        index: { jobType: 'remove-index' },
      }));
    }

    // Pending unique job
    if (isUnique === attr.isUniq) {
      setPendingJobs((p) => ({ ...p, unique: undefined }));
    } else if (isUnique) {
      setPendingJobs((p) => ({ ...p, unique: { jobType: 'unique' } }));
    } else if (!isUnique) {
      setPendingJobs((p) => ({
        ...p,
        unique: { jobType: 'remove-unique' },
      }));
    }

    // Checked data type
    if (checkedDataType === (attr.checkedDataType || 'any')) {
      setPendingJobs((p) => ({ ...p, type: undefined }));
    } else {
      if (checkedDataType === 'any') {
        setPendingJobs((p) => ({
          ...p,
          type: { jobType: 'remove-data-type' },
        }));
      } else {
        setPendingJobs((p) => ({
          ...p,
          type: { jobType: 'check-data-type', checkedDataType },
        }));
      }
    }
  }, [isRequired, isIndexed, isUnique, checkedDataType, attr, runningjobs]);

  const [isCreatingJobs, setIsCreatingJobs] = useState(false);

  const apply = async () => {
    if (isCreatingJobs) return;

    // Clean up previous errors
    setRunningJobs({});
    setIsCreatingJobs(true);
    Object.entries(pendingJobs).forEach(async ([jobType, pendingJob]) => {
      if (!pendingJob) return;
      const res = await fetch(
        `${config.apiURI}/dash/apps/${appId}/indexing-jobs`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            'app-id': appId,
            'attr-id': attr.id,
            'job-type': pendingJob.jobType,
            'checked-data-type': pendingJob.checkedDataType,
          }),
        },
      );
      const json = await res.json();
      setRunningJobs((p) => ({ ...p, [jobType]: json.job }));
      setPendingJobs((p) => ({ ...p, [jobType]: undefined }));
      setIsCreatingJobs(false);
      const fetchLoop = jobFetchLoop(appId, json.job.id, token);
      await fetchLoop.start((updatedJob, error) => {
        if (error) {
          return;
        }

        if (updatedJob) {
          const workEstimateTotal = updatedJob.work_estimate ?? 50000;
          const workCompletedTotal = updatedJob.work_completed ?? 0;

          const percent = Math.floor(
            (workCompletedTotal / workEstimateTotal) * 100,
          );
          setProgress((prev) => ({ ...prev, [jobType]: percent }));

          setRunningJobs((prev) => ({
            ...prev,
            [jobType]: updatedJob,
          }));
        }
      });
      fetchLoop.stop();
    });
  };

  // Get average of non-zero and non-100 loading values
  const progressPercent = useMemo(() => {
    return (Object.values(progress)
      .filter((p) => p > 0 && p < 100)
      .reduce((a, b) => a + b, 0) /
      Object.values(progress).filter((n) => n > 0 && n < 100).length) as
      | number
      | null;
  }, [progress]);

  return {
    isPending: Object.values(pendingJobs).filter(Boolean).length > 0,
    progress: progressPercent,
    isRunning: Object.values(runningjobs).some(
      (job) => job.job_status !== 'completed' && job.job_status !== 'errored',
    ),
    pending: pendingJobs,
    running: runningjobs,
    apply,
  };
};

import { useEffect, useState, useRef } from 'react';
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
  checkedDataType,
  token,
}: {
  attr: SchemaAttr;
  appId: string;
  token: string;
  isRequired: boolean;
  checkedDataType: CheckedDataType | 'any';
}) => {
  const [pendingJobs, setPendingJobs] = useState<{
    [jobType in JobConstraintTypes]?: PendingJob;
  }>({});

  const [runningjobs, setRunningJobs] = useState<{
    [jobType in JobConstraintTypes]?: InstantIndexingJob;
  }>({});

  const fetchLoopsRef = useRef<{ [jobType: string]: { stop: () => void } }>({});

  // Keep running jobs updated
  useEffect(() => {
    Object.entries(runningjobs).forEach(([jobType, job]) => {
      if (
        !job ||
        job.job_status === 'completed' ||
        job.job_status === 'errored'
      ) {
        return;
      }

      if (fetchLoopsRef.current[jobType]) {
        return;
      }

      const fetchLoop = jobFetchLoop(appId, job.id, token);
      fetchLoopsRef.current[jobType] = fetchLoop;

      fetchLoop.start((updatedJob, error) => {
        if (error) {
          console.error('Job polling error:', error);
          return;
        }

        if (updatedJob) {
          setRunningJobs((prev) => ({
            ...prev,
            [jobType]: updatedJob,
          }));

          if (
            updatedJob.job_status === 'completed' ||
            updatedJob.job_status === 'errored'
          ) {
            delete fetchLoopsRef.current[jobType];
          }
        }
      });
    });

    return () => {
      Object.values(fetchLoopsRef.current).forEach((fetchLoop) => {
        fetchLoop.stop();
      });
      fetchLoopsRef.current = {};
    };
  }, [runningjobs, appId, token]);

  useEffect(() => {
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
  }, [isRequired, checkedDataType, attr]);

  const apply = async () => {
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
    });
  };

  return {
    isPending: Object.values(pendingJobs).filter(Boolean).length > 0,
    isRunning: Object.values(runningjobs).filter(Boolean).length > 0,
    pending: pendingJobs,
    running: runningjobs,
    apply,
  };
};

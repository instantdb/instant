import { useEffect, useState } from 'react';
import useCurrentDate from './useCurrentDate';

import { messageFromInstantError } from '@/lib/errors';
import { InstantIssue } from '../types';
import { fetchTotalSessionsCount } from './fetchTotalSessionsCount';

type State =
  | { isLoading: true; data: undefined; error: undefined }
  | { isLoading: false; data: number; error: undefined }
  | { isLoading: false; data: undefined; error: { message: string } };

export default function useTotalSessionsCount({
  refreshSeconds,
  initialData,
}: {
  refreshSeconds: number;
  initialData?: number;
}): State {
  const date = useCurrentDate({ refreshSeconds });
  const [state, setState] = useState<State>(
    initialData != null
      ? { isLoading: false, data: initialData, error: undefined }
      : { isLoading: true, data: undefined, error: undefined },
  );
  useEffect(() => {
    let cancel = false;
    async function exec() {
      try {
        const body = await fetchTotalSessionsCount();
        if (cancel) return;
        const totalCount = (body['total-count'] as number) || 0;
        setState({ data: totalCount, isLoading: false, error: undefined });
      } catch (error) {
        if (cancel) return;
        const message =
          messageFromInstantError(error as InstantIssue) ||
          'Failed to fetch total sessions count';
        setState({ data: undefined, error: { message }, isLoading: false });
      }
    }
    exec();
    return () => {
      cancel = true;
    };
  }, [date]);

  return state;
}

import { useEffect, useState } from 'react';
import useCurrentDate from './useCurrentDate';

import config from '@/lib/config';
import { jsonFetch } from '../fetch';
import { messageFromInstantError } from '@/lib/errors';
import { InstantIssue } from '../types';

async function fetchTotalSessionsCount() {
  return jsonFetch(`${config.apiURI}/dash/stats/active_sessions`, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
    },
  });
}

type State =
  | { isLoading: true; data: undefined; error: undefined }
  | { isLoading: false; data: number; error: undefined }
  | { isLoading: false; data: undefined; error: { message: string } };

export default function useTotalSessionsCount({
  refreshSeconds,
}: {
  refreshSeconds: number;
}): State {
  const date = useCurrentDate({ refreshSeconds });
  const [state, setState] = useState<State>({
    isLoading: true,
    data: undefined,
    error: undefined,
  });
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

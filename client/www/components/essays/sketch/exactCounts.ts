import { useEffect } from 'react';
import { useState } from 'react';

/**
 * To regen. Open up inspector and write:
 * copy(Object.fromEntries(Object.keys(shortlist).map(x => [x, exactCounts[x]])))
 */
const shortlist = {
  chap: 873,
  scamp: 6,
  soul: 709,
  beetle: 59,
  castle: 454,
  peer: 189,
  like: 9073,
  wet: 168,
};

let exactCountResult: ExactCountsResults = {
  status: 'isLoading',
  counts: shortlist,
};

let promise: Promise<void> | null = null;

async function fetchFullCounts() {
  try {
    const res = await import('./allExactCounts.json');
    const data = res.default;
    if (typeof window !== 'undefined') {
      (window as any).shortlist = shortlist;
      (window as any).exactCounts = data;
    }
    exactCountResult = { status: 'done', counts: data };
  } catch (e) {
    console.error(e);
    exactCountResult = {
      status: 'hasError',
      counts: shortlist,
      message: 'Failed to fetch full counts',
    };
  }
}

type ExactCountsResults =
  | { status: 'isLoading'; counts: Record<string, number> }
  | { status: 'done'; counts: Record<string, number> }
  | { status: 'hasError'; counts: Record<string, number>; message: string };

export function useExactCounts(): ExactCountsResults {
  const [state, setState] = useState<ExactCountsResults>(exactCountResult);
  useEffect(() => {
    let cancelled = false;
    const done = () => {
      if (cancelled) return;
      setState(exactCountResult);
    };
    if (promise) {
      promise.finally(done);
      return;
    }
    promise = fetchFullCounts();
    promise.finally(done);

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

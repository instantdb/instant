'use client';

import { useEffect, useRef } from 'react';
import { prodDB as db } from '@/lib/intern/docs-feedback/db';

const FALLBACK_STAR_COUNT = parseInt(
  // The env var is set in next.config.ts at build time
  process.env.NEXT_PUBLIC_FALLBACK_STAR_COUNT ?? '9782',
  10,
);

export function useStarCount(
  fullName: string,
  onCountIncrease?: (delta: number) => void,
): number {
  const { data } = db.useQuery({
    ghStarTotals: {
      $: {
        where: { repoFullName: fullName },
        limit: 1,
      },
    },
  });

  const liveCount = data?.ghStarTotals?.[0]?.stargazersCount;
  const prevLiveCount = useRef<number | undefined>(undefined);
  const onCountIncreaseRef = useRef(onCountIncrease);
  onCountIncreaseRef.current = onCountIncrease;

  useEffect(() => {
    if (liveCount == null) return;
    if (prevLiveCount.current != null && liveCount > prevLiveCount.current) {
      onCountIncreaseRef.current?.(liveCount - prevLiveCount.current);
    }
    prevLiveCount.current = liveCount;
  }, [liveCount]);

  return liveCount ?? FALLBACK_STAR_COUNT;
}

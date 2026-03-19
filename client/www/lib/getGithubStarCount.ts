import useSWR from 'swr';
import { serverOverrideAndTTL } from './swrMiddleware';

const fetchGithubStarCountFromServer = async () => {
  const response = await fetch('/api/stars');
  if (!response.ok) throw new Error('Failed to fetch github star count');
  const responseData = (await response.json()) as { starCount: number };
  return responseData.starCount;
};

export const useGithubStarCount = () => {
  // Refetch the github star count if:
  // 1. There's no preloaded value from server (cached hourly)
  // 2. It's been one day since you saved the star count after fetching
  const starCountResult = useSWR('starCount', fetchGithubStarCountFromServer, {
    use: [
      serverOverrideAndTTL({ ttlMinutes: 1440, disableFetchIfCached: true }),
    ],
  });

  return starCountResult.data;
};

import z from 'zod';
import { formatNumberCompact } from './format';
import useSWR from 'swr';
import { serverOverrideAndTtl } from './swrMiddleware';

const githubStarResponseSchema = z.object({
  stargazers_count: z.number(),
});

// Each page requires a `getStaticProps` to fetch the star count
// these will run in parallel at build time so caching the response should help prevent hitting the rate limit
let cachedValue: number | null = null;

// Called on both the client and the server (server calls at build time)
export const getGithubStarCount = async (): Promise<number> => {
  if (cachedValue) return cachedValue;

  const response = await fetch(
    'https://api.github.com/repos/instantdb/instant',
    {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = await response.json();
  const parseResult = githubStarResponseSchema.safeParse(data);

  if (parseResult.error) {
    throw new Error(JSON.stringify(parseResult.error));
  }

  cachedValue = parseResult.data.stargazers_count;
  return parseResult.data.stargazers_count;
};

export const useGithubStarCount = () => {
  // Refetch the github star count if:
  // 1. There's no preloaded value from server (cached houry)
  // 2. It's been one day since you saved the star count after fetching
  const starCountResult = useSWR('starCount', getGithubStarCount, {
    use: [
      serverOverrideAndTtl({ ttlMinutes: 1440, disableFetchIfCached: true }),
    ],
  });

  const humanReadableStarCount = starCountResult.data
    ? formatNumberCompact(starCountResult.data)
    : undefined;

  return humanReadableStarCount;
};

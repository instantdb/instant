import z from 'zod';

const githubStarResponseSchema = z.object({
  stargazers_count: z.number(),
});

// Each page requires a `getStaticProps` to fetch the star count
// these will run in parallel at build time so caching the response should help prevent hitting the rate limit
let cachedValue: number | null = null;

export const getGithubStarCount = async (): Promise<number> => {
  if (cachedValue) return cachedValue;
  const accessToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

  const response = await fetch(
    'https://api.github.com/repos/instantdb/instant',
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: accessToken ? `Bearer ${accessToken}` : '',
      },
      next: {
        revalidate: 3600,
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

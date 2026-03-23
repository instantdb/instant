import z from 'zod';

const githubStarResponseSchema = z.object({
  stargazers_count: z.number(),
});

export const getGithubStarCount = async (): Promise<number> => {
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
    throw new Error(parseResult.error.message);
  }

  return parseResult.data.stargazers_count;
};

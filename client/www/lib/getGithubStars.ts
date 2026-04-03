const DEV_GITHUB_STAR_COUNT = 9778;

export const getGithubStarCount = async (): Promise<number> => {
  if (process.env.NODE_ENV === 'development') {
    return DEV_GITHUB_STAR_COUNT;
  }

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
  try {
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();
    const starCount = data?.stargazers_count;
    if (typeof starCount !== 'number') {
      throw new Error('GitHub stars response did not include stargazers_count');
    }

    return starCount;
  } catch {
    return DEV_GITHUB_STAR_COUNT;
  }
};

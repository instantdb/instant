import { getGithubStarCount } from '@/lib/getGithubStars';
import { NextResponse } from 'next/server';

export const revalidate = 3600;

export const GET = async () => {
  const count = await getGithubStarCount();
  return NextResponse.json(
    {
      starCount: count,
    },
    {
      headers: {
        Cache: 'max-age=3600',
      },
    },
  );
};

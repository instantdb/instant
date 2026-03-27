import { getGithubStarCount } from '@/lib/getGithubStars';
import { StarCountProvider } from '@/lib/starCountContext';

export const revalidate = 3600;

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const starCount = await getGithubStarCount();
  return (
    <StarCountProvider starCount={starCount}>{children}</StarCountProvider>
  );
}

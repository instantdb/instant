import type { GetStaticProps, GetStaticPropsResult } from 'next';
import { getGithubStarCount } from './getGithubStars';

export type StarCountProps = { starCount: number };

/**
 * Wraps a page's getStaticProps to inject `starCount` into props.
 * Errors propagate — if the GitHub API fails at build time, the build fails.
 * During ISR, Next.js serves the stale page.
 *
 * Usage:
 *   // Page with no other static props:
 *   export const getStaticProps = withStarCount();
 *
 *   // Page with existing static props:
 *   export const getStaticProps = withStarCount(async (ctx) => {
 *     return { props: { posts: getAllPosts() } };
 *   });
 */
export function withStarCount<P extends Record<string, unknown> = {}>(
  inner?: GetStaticProps<P>,
): GetStaticProps<P & StarCountProps> {
  return async (context) => {
    const starCount = await getGithubStarCount();

    if (!inner) {
      return {
        props: { starCount } as P & StarCountProps,
        revalidate: 3600,
      };
    }

    const result = await inner(context);

    if ('props' in result) {
      const innerProps = await result.props;
      return {
        ...result,
        props: { ...innerProps, starCount },
        revalidate: result.revalidate ?? 3600,
      };
    }

    // redirect or notFound — pass through unchanged
    return result as GetStaticPropsResult<P & StarCountProps>;
  };
}

import { createContext, useContext, type ReactNode } from 'react';

const StarCountContext = createContext<number | null>(null);

/**
 * Provides the GitHub star count to the component tree.
 * Logs a dev-mode warning if starCount is missing — this means
 * the page forgot to use `withStarCount()` in its getStaticProps.
 */
export function StarCountProvider({
  starCount,
  children,
}: {
  starCount: number | undefined;
  children: ReactNode;
}) {
  if (process.env.NODE_ENV === 'development' && starCount == null) {
    console.error(
      '[StarCountProvider] starCount is missing from pageProps. ' +
        'This page should use withStarCount() in its getStaticProps.',
    );
  }
  return (
    <StarCountContext.Provider value={starCount ?? null}>
      {children}
    </StarCountContext.Provider>
  );
}

/**
 * Returns the GitHub star count.
 *
 * TypeScript: return type is `number` (not `number | undefined`),
 * so callers don't need null-checks.
 *
 * Runtime: throws if the star count was never provided — this means
 * the page forgot to use `withStarCount()` in its getStaticProps.
 */
export function useStarCount(): number {
  const value = useContext(StarCountContext);
  if (value == null) {
    throw new Error(
      'useStarCount(): star count is not available. ' +
        'Ensure this page uses withStarCount() in its getStaticProps.',
    );
  }
  return value;
}

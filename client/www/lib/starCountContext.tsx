import { createContext, useContext, type ReactNode } from 'react';

const StarCountContext = createContext<number | null>(null);

/**
 * Provides the GitHub star count to the component tree.
 * Logs a dev-mode warning if starCount is missing — this means
 * the page forgot to use `withStarCount()` in its getStaticProps.
 *
 * Note: Markdoc docs pages (.md) can't export getStaticProps, so
 * starCount will be null for those pages. The warning is suppressed
 * for markdoc pages (detected via the `isMarkdoc` flag).
 */
export function StarCountProvider({
  starCount,
  isMarkdoc,
  children,
}: {
  starCount: number | undefined;
  isMarkdoc: boolean;
  children: ReactNode;
}) {
  if (
    process.env.NODE_ENV === 'development' &&
    starCount == null &&
    !isMarkdoc
  ) {
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
 * Returns the GitHub star count, or null if unavailable.
 *
 * TypeScript: return type is `number | null`. Callers that require the
 * count (like the homepage) get a type-level nudge to handle the null
 * case. Pages rendered via Markdoc (.md docs) don't supply starCount,
 * so consumers must handle null gracefully.
 *
 * Runtime: in development, the StarCountProvider warns when starCount
 * is missing on non-Markdoc pages — surfacing forgotten withStarCount()
 * calls without crashing the build.
 */
export function useStarCount(): number | null {
  return useContext(StarCountContext);
}

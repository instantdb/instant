import { createContext, useContext, type ReactNode } from 'react';

const StarCountContext = createContext<number | null>(null);

export function StarCountProvider({
  starCount,
  children,
}: {
  starCount: number | undefined;
  children: ReactNode;
}) {
  return (
    <StarCountContext.Provider value={starCount ?? null}>
      {children}
    </StarCountContext.Provider>
  );
}

/**
 * Returns the GitHub star count, or null if unavailable.
 *
 * TypeScript-level detection: the return type `number | null` forces
 * callers to handle the missing case — you can't accidentally treat
 * it as a number.
 *
 * Runtime detection: pages that forget `withStarCount()` will render
 * an empty star badge, which is immediately visible during development.
 */
export function useStarCount(): number | null {
  return useContext(StarCountContext);
}

'use client';

import { createContext, useContext, type ReactNode } from 'react';

const StarCountContext = createContext<number | null>(null);

export function StarCountProvider({
  starCount,
  children,
}: {
  starCount: number;
  children: ReactNode;
}) {
  return (
    <StarCountContext.Provider value={starCount}>
      {children}
    </StarCountContext.Provider>
  );
}

/**
 * Returns the GitHub star count, or null if outside the provider.
 *
 * Marketing pages (under app/(marketing)/layout.tsx) always get a number.
 * Docs pages (Pages Router) get null — the star badge renders empty.
 */
export function useStarCount(): number | null {
  return useContext(StarCountContext);
}

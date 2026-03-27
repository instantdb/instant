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

export function useStarCount(): number {
  const value = useContext(StarCountContext);
  if (value == null) {
    throw new Error(
      'useStarCount() must be used within StarCountProvider. ' +
        'Ensure this page is under app/layout.tsx.',
    );
  }
  return value;
}

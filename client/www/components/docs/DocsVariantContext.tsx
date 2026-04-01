'use client';

import { createContext, useContext } from 'react';

export type DocsVariantContextValue = {
  pagePath: string | null;
  param: string | null;
  value: string | null;
};

const defaultValue: DocsVariantContextValue = {
  pagePath: null,
  param: null,
  value: null,
};

const DocsVariantContext = createContext<DocsVariantContextValue>(defaultValue);

export function DocsVariantProvider({
  value,
  children,
}: {
  value: DocsVariantContextValue;
  children: React.ReactNode;
}) {
  return (
    <DocsVariantContext.Provider value={value}>
      {children}
    </DocsVariantContext.Provider>
  );
}

export function useDocsVariant() {
  return useContext(DocsVariantContext);
}

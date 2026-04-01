'use client';

import { Layout } from '@/components/docs/Layout';
import {
  DocsVariantProvider,
  useDocsVariant,
} from '@/components/docs/DocsVariantContext';
import { getCanonicalDocsPagePath } from '@/lib/docsVariants';
import { usePathname } from 'next/navigation';

function DocsVariantRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentVariant = useDocsVariant();
  const pagePath =
    currentVariant.pagePath ?? getCanonicalDocsPagePath(pathname || '/docs');

  return (
    <DocsVariantProvider
      value={{
        pagePath,
        param: currentVariant.param,
        value: currentVariant.value,
      }}
    >
      {children}
    </DocsVariantProvider>
  );
}

export function DocsWrapper({
  frontmatter,
  tableOfContents,
  children,
}: {
  frontmatter: any;
  tableOfContents: any[];
  children: React.ReactNode;
}) {
  const title = frontmatter?.title ?? frontmatter?.nextjs?.metadata?.title;

  return (
    <DocsVariantRoot>
      <Layout title={title} tableOfContents={tableOfContents}>
        {children}
      </Layout>
    </DocsVariantRoot>
  );
}

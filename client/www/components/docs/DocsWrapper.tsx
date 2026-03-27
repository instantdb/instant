'use client';

import { Layout } from '@/components/docs/Layout';
import { Suspense } from 'react';

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
    <Suspense>
      <Layout title={title} tableOfContents={tableOfContents}>
        {children}
      </Layout>
    </Suspense>
  );
}

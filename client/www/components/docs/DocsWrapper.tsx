'use client';

import { Layout } from '@/components/docs/Layout';

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
    <Layout title={title} tableOfContents={tableOfContents}>
      {children}
    </Layout>
  );
}

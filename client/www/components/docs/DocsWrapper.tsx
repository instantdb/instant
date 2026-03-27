'use client';

import 'focus-visible';
import { slugifyWithCounter } from '@sindresorhus/slugify';
import { Layout } from '@/components/docs/Layout';
import { Suspense, useMemo } from 'react';

function getNodeText(node: any): string {
  let text = '';
  for (let child of node.children ?? []) {
    if (typeof child === 'string') {
      text += child;
    }
    text += getNodeText(child);
  }
  return text;
}

function collectHeadings(nodes: any[], slugify = slugifyWithCounter()): any[] {
  let sections: any[] = [];

  for (let node of nodes) {
    const isH2 =
      node.name === 'h2' ||
      (node.name === 'Heading' && node.attributes?.level === 2);
    const isH3 =
      node.name === 'h3' ||
      (node.name === 'Heading' && node.attributes?.level === 3);

    if (isH2 || isH3) {
      let title = getNodeText(node);
      if (title) {
        let id = slugify(title);
        node.attributes.id = id;
        if (isH3) {
          if (!sections[sections.length - 1]) {
            throw new Error(
              'Cannot add `h3` to table of contents without a preceding `h2`',
            );
          }
          sections[sections.length - 1].children.push({
            ...node.attributes,
            title,
          });
        } else {
          sections.push({ ...node.attributes, title, children: [] });
        }
      }
    }

    // Don't render headings for conditional content
    if (node.name === 'Conditional') {
      continue;
    }

    sections.push(...collectHeadings(node.children ?? [], slugify));
  }

  return sections;
}

export function DocsWrapper({
  frontmatter,
  children,
}: {
  frontmatter: any;
  children: React.ReactNode;
}) {
  const title = frontmatter?.nextjs?.metadata?.title;
  const description = frontmatter?.nextjs?.metadata?.description;

  const tableOfContents = useMemo(() => {
    if (!children) return [];
    const nodes = Array.isArray(children) ? children : [children];
    return collectHeadings(nodes);
  }, [children]);

  return (
    <Suspense>
      <Layout title={title} tableOfContents={tableOfContents}>
        {children}
      </Layout>
    </Suspense>
  );
}

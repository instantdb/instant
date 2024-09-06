import 'focus-visible';
import Head from 'next/head';
import { slugifyWithCounter } from '@sindresorhus/slugify';
import { Layout } from '@/components/docs/Layout';
import { useMemo } from 'react';

function getNodeText(node) {
  let text = '';
  for (let child of node.children ?? []) {
    if (typeof child === 'string') {
      text += child;
    }
    text += getNodeText(child);
  }
  return text;
}

function collectHeadings(nodes, slugify = slugifyWithCounter()) {
  let sections = [];

  for (let node of nodes) {
    if (node.name === 'h2' || node.name === 'h3') {
      let title = getNodeText(node);
      if (title) {
        let id = slugify(title);
        node.attributes.id = id;
        if (node.name === 'h3') {
          if (!sections[sections.length - 1]) {
            throw new Error(
              'Cannot add `h3` to table of contents without a preceding `h2`'
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

export function DocsPage({ Component, pageProps }) {
  let title = pageProps.markdoc?.frontmatter.title;

  let pageTitle =
    pageProps.markdoc?.frontmatter.pageTitle ||
    `${pageProps.markdoc?.frontmatter.title} - Instant Docs`;

  let description = pageProps.markdoc?.frontmatter.description;

  let tableOfContents = useMemo(() => {
    return pageProps.markdoc?.content
      ? collectHeadings(pageProps.markdoc.content)
      : [];
  }, [pageProps.markdoc]);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        {description && <meta name="description" content={description} />}
      </Head>
      <Layout title={title} tableOfContents={tableOfContents}>
        <Component {...pageProps} />
      </Layout>
    </>
  );
}

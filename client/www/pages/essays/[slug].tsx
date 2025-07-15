import format from 'date-fns/format';
import parse from 'date-fns/parse';
import Head from 'next/head';
import { getAllSlugs, getHTMLPostBySlug } from '../../lib/posts';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  PageProgressBar,
  type Post,
} from '@/components/marketingUi';
import * as og from '@/lib/og';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import AgentsEssayDemo from '@/components/essays/shouts_demo';

function Prose({ html }: { html: string }) {
  return (
    <div
      className="prose prose-headings:font-medium prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-4 prose-h2:mb-2 prose-pre:bg-gray-100 mx-auto"
      dangerouslySetInnerHTML={{ __html: html }}
    ></div>
  );
}

const specialComponents = {
  agents: [{ id: 'shouts-demo', comp: AgentsEssayDemo }],
} as const;

function useAttachSpecialComponents({ post }: { post: Post }) {
  const slug = post.slug;
  useEffect(() => {
    const specialComps =
      specialComponents[slug as keyof typeof specialComponents];
    if (!specialComps) {
      return;
    }
    specialComps.forEach(({ id, comp }) => {
      const el = document.getElementById(id);
      if (!el) {
        throw new Error(`Element with id ${id} not found`);
      }
      const root = createRoot(el);
      const Comp = comp;
      root.render(<Comp />);
      return () => {
        root.unmount();
      };
    });
  }, [slug]);
}
const Post = ({ post }: { post: Post }) => {
  const { title, date, mdHTML, authors, hero, og_image } = post;
  useAttachSpecialComponents({ post });
  return (
    <LandingContainer>
      <Head>
        <title>{title}</title>
        <meta key="og:title" property="og:title" content={title} />
        <meta
          key="og:image"
          property="og:image"
          content={og_image || hero || og.url({ title, section: 'blog' })}
        />
        <meta key="og:type" property="og:type" content="article" />
        <meta
          key="og:article:author"
          property="article:author"
          content={authors.map((author) => author.name).join(', ')}
        />
      </Head>
      <PageProgressBar />
      <MainNav />
      <div className="mt-6 p-4 space-y-4">
        <div className="mb-4 py-4 max-w-prose mx-auto">
          <h1 className="text-4xl font-medium mb-2">{title}</h1>
          <div className="flex text-sm text-gray-500">
            <span>
              {authors.map((author, idx) => {
                return (
                  <span>
                    <a
                      className="hover:text-blue-500"
                      href={author.url}
                      target="_blank"
                    >
                      {author.name}
                    </a>
                    {idx !== authors.length - 1 ? ', ' : ''}
                  </span>
                );
              })}
            </span>
            <span className="mx-1">·</span>
            {format(parse(date, 'yyyy-MM-dd', new Date()), 'MMM do, yyyy')}
          </div>
        </div>
        {hero && (
          <div className="max-w-3xl mx-auto">
            <img src={hero} className="w-full rounded" />
          </div>
        )}
        <Prose html={mdHTML} />
      </div>
      <LandingFooter />
    </LandingContainer>
  );
};

export async function getStaticPaths() {
  return {
    paths: getAllSlugs().map((slug) => `/essays/${slug}`),
    fallback: false,
  };
}

export async function getStaticProps({
  params: { slug },
}: {
  params: { slug: string };
}) {
  return {
    props: { post: getHTMLPostBySlug(slug) },
  };
}

export default Post;

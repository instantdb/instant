import { RssIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import Head from 'next/head';
import NextLink from 'next/link';
import type { ElementType, ReactNode } from 'react';
import { LandingContainer, MainNav } from '@/components/marketingUi';
import * as og from '@/lib/og';
import { Footer } from '@/components/new-landing/Footer';
import { SectionTitle } from '@/components/new-landing/typography';
import { formatAuthorByline, formatDuration } from '../../lib/postUtils';
import { getAllPosts, type Author, type Post } from '../../lib/posts';

type EssaysIndexPost = Omit<Post, 'content'>;

export async function getStaticProps() {
  return {
    props: { posts: getAllPosts() },
  };
}

function LinkedHeading({
  children,
  as: Tag = 'h3',
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
}) {
  return (
    <Tag
      className={clsx(
        'leading-snug font-bold underline decoration-transparent decoration-2 underline-offset-4 transition-[text-decoration-color] duration-300 group-hover:decoration-current',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

function PostCard({ post }: { post: EssaysIndexPost }) {
  return (
    <NextLink
      href={`/essays/${post.slug}`}
      className="group block h-full border border-gray-200 bg-white p-5 transition-[box-shadow] hover:shadow-sm lg:p-6"
    >
      {post.thumbnail && (
        <div className="mb-5 h-44 overflow-hidden">
          <img
            src={post.thumbnail}
            alt={post.title}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <LinkedHeading className="text-lg">{post.title}</LinkedHeading>
      <div className="mt-3 flex items-center text-base text-gray-500">
        <span>{formatAuthorByline(post.authors)}</span>
        <span className="ml-auto">{formatDuration(post)}</span>
      </div>
      {post.summary && (
        <p className="mt-4 text-base leading-relaxed text-gray-500">
          {post.summary}
        </p>
      )}
    </NextLink>
  );
}

function HeroPostCard({ post }: { post: EssaysIndexPost }) {
  return (
    <NextLink
      href={`/essays/${post.slug}`}
      className="group block overflow-hidden border border-gray-200 bg-white transition-[box-shadow] hover:shadow-sm"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr]">
        {post.thumbnail && (
          <div className="overflow-hidden">
            <img
              src={post.thumbnail}
              alt={post.title}
              className="aspect-[16/10] h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex flex-col justify-center p-6 md:p-8">
          <LinkedHeading as="h2" className="text-2xl md:text-3xl">
            {post.title}
          </LinkedHeading>
          <div className="mt-5 flex items-center text-base text-gray-500">
            <span>{formatAuthorByline(post.authors)}</span>
            <span className="ml-auto">{formatDuration(post)}</span>
          </div>
          {post.summary && (
            <p className="mt-3 text-base leading-relaxed text-gray-500">
              {post.summary}
            </p>
          )}
        </div>
      </div>
    </NextLink>
  );
}

export default function Page({ posts }: { posts: EssaysIndexPost[] }) {
  const publishedPosts = posts.filter((post) => !post.isDraft);
  const [hero, ...rest] = publishedPosts;

  return (
    <LandingContainer>
      <Head>
        <title>Instant Essays</title>
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ section: 'blog' })}
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="RSS Feed for Instant Essays"
          href="/rss.xml"
        />
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <MainNav transparent />
        <div className="landing-width mx-auto flex-1 pt-28 pb-16 sm:pt-32 sm:pb-20">
          <div className="mb-10 flex items-center justify-between">
            <SectionTitle>Essays</SectionTitle>
            <NextLink
              href="/rss.xml"
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="RSS Feed"
            >
              <RssIcon className="h-5 w-5" />
            </NextLink>
          </div>

          {hero && <HeroPostCard post={hero} />}

          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
            {rest.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
        <Footer />
      </div>
    </LandingContainer>
  );
}

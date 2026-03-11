import format from 'date-fns/format';
import parse from 'date-fns/parse';
import Head from 'next/head';
import {
  getAllSlugs,
  getPostBySlug,
  type Post,
  type Author,
} from '../lib/posts';
import _ from 'lodash';
import NextLink from 'next/link';
import { LandingContainer, MainNav } from '@/components/marketingUi';
import * as og from '@/lib/og';
import { Footer } from '@/components/new-landing/Footer';
import { SectionTitle } from '@/components/new-landing/typography';

type PostWithSnippet = Omit<Post, 'content'> & {
  snippet: string;
  readingTime: number;
  flyThumbnail: string;
  customThumbnail: string | null;
};

import {
  authorAvatars,
  authorFirstNames,
  customDurations,
  customSnippets,
  customThumbnails,
  flyPlaceholders,
} from '@/lib/essays';

function shortName(name: string): string {
  if (authorFirstNames[name]) return authorFirstNames[name];
  const parts = name.split(' ');
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function formatDuration(post: PostWithSnippet): string {
  const isVideo = post.title.startsWith('Video:');
  const mins = post.readingTime;
  const label = isVideo ? 'watch' : 'read';
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m ${label}` : `${h}h ${label}`;
  }
  return `${mins} min ${label}`;
}

function formatAuthors(authors: Author[]): string {
  if (authors.length === 1) return authors[0].name;
  return authors.map((a) => shortName(a.name)).join(' & ');
}

function extractSnippet(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headings, images, html tags, empty lines, links-only lines
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('!') ||
      trimmed.startsWith('<') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('[!')
    )
      continue;
    // Strip markdown formatting
    const clean = trimmed
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/[*_`~]/g, '') // bold/italic/code
      .trim();
    if (clean.length > 20) {
      return clean.length > 160 ? clean.slice(0, 157) + '...' : clean;
    }
  }
  return '';
}

function extractFirstImage(content: string): string | null {
  const mdMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (mdMatch) return mdMatch[1];
  const htmlMatch = content.match(/<img[^>]+src=["']([^"']+)["']/);
  if (htmlMatch) return htmlMatch[1];
  return null;
}

function AuthorAvatars({ authors }: { authors: Author[] }) {
  return (
    <div className="flex -space-x-1.5">
      {authors.map((author) => {
        const avatar = authorAvatars[author.name];
        return avatar ? (
          <img
            key={author.name}
            src={avatar}
            alt={author.name}
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <div
            key={author.name}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-500"
          >
            {author.name[0]}
          </div>
        );
      })}
    </div>
  );
}

function FormattedDate({ date }: { date: string }) {
  return (
    <span className="text-base text-gray-500">
      {format(parse(date, 'yyyy-MM-dd', new Date()), 'MMM do, yyyy')}
    </span>
  );
}

export async function getStaticProps() {
  const posts = getAllSlugs()
    .map((slug) => getPostBySlug(slug))
    .filter((p) => !p.isDraft);
  const sorted = _.orderBy(posts, 'date', 'desc');
  const withSnippets: PostWithSnippet[] = sorted.map((p, i) => ({
    ..._.omit(p, 'content'),
    snippet: customSnippets[p.slug] ?? '',
    readingTime:
      customDurations[p.slug] ??
      Math.max(1, Math.round(p.content.split(/\s+/).length / 250)),
    flyThumbnail: flyPlaceholders[i % flyPlaceholders.length],
    customThumbnail: customThumbnails[p.slug] ?? null,
  }));
  return { props: { posts: withSnippets } };
}

function FeaturedPost({ post }: { post: PostWithSnippet }) {
  const { title, slug, date, authors, snippet } = post;

  return (
    <NextLink href={`/essays-2/${slug}`} className="group block">
      <h2 className="text-2xl leading-snug font-bold underline decoration-transparent decoration-2 underline-offset-4 transition-[text-decoration-color] duration-300 group-hover:decoration-current md:text-3xl">
        {title}
      </h2>
      {snippet && (
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-500">
          {snippet}
        </p>
      )}
      <div className="mt-5 flex items-center text-base text-gray-500">
        <AuthorAvatars authors={authors} />
        <span className="ml-2">{formatAuthors(authors)}</span>
        <span className="ml-auto">{formatDuration(post)}</span>
      </div>
    </NextLink>
  );
}

function PostCard({ post }: { post: PostWithSnippet }) {
  const { title, slug, date, authors, snippet } = post;
  const thumbnail = getThumbnail(post);

  return (
    <NextLink
      href={`/essays-2/${slug}`}
      className="group block h-full border border-gray-200 bg-white p-5 transition-colors hover:border-gray-300 lg:p-6"
    >
      {thumbnail && (
        <div className="mb-5 h-44 overflow-hidden">
          <img
            src={thumbnail}
            alt={title}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <h3 className="text-lg leading-snug font-bold underline decoration-transparent decoration-2 underline-offset-4 transition-[text-decoration-color] duration-300 group-hover:decoration-current">
        {title}
      </h3>
      <div className="mt-3 flex items-center text-base text-gray-500">
        <span>{formatAuthors(authors)}</span>
        <span className="ml-auto">{formatDuration(post)}</span>
      </div>
      {snippet && (
        <p className="mt-4 text-base leading-relaxed text-gray-500">
          {snippet}
        </p>
      )}
    </NextLink>
  );
}

function getThumbnail(post: PostWithSnippet): string {
  return post.customThumbnail ?? post.flyThumbnail;
}

export default function Essays3({ posts }: { posts: PostWithSnippet[] }) {
  const hero = posts[0];
  const rest = posts.slice(1);

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
            <div className="flex items-center gap-2">
              <NextLink
                href="/rss.xml"
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <svg
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M3.75 3a.75.75 0 00-.75.75v.5c0 .414.336.75.75.75H4c6.075 0 11 4.925 11 11v.25c0 .414.336.75.75.75h.5a.75.75 0 00.75-.75V16C17 8.82 11.18 3 4 3h-.25z" />
                  <path d="M3 8.75A.75.75 0 013.75 8H4a8 8 0 018 8v.25a.75.75 0 01-.75.75h-.5a.75.75 0 01-.75-.75V16a6 6 0 00-6-6h-.25A.75.75 0 013 9.25v-.5zM7 15a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </NextLink>
            </div>
          </div>

          {hero && (
            <NextLink
              href={`/essays-2/${hero.slug}`}
              className="group block overflow-hidden border border-gray-200 bg-white transition-colors hover:border-gray-300"
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr]">
                <div className="overflow-hidden">
                  <img
                    src={getThumbnail(hero)}
                    alt={hero.title}
                    className="aspect-[16/10] h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-col justify-center p-6 md:p-8">
                  <h2 className="text-2xl leading-snug font-bold underline decoration-transparent decoration-2 underline-offset-4 transition-[text-decoration-color] duration-300 group-hover:decoration-current md:text-3xl">
                    {hero.title}
                  </h2>
                  <div className="mt-3 flex items-center text-base text-gray-500">
                    <span>{formatAuthors(hero.authors)}</span>
                    <span className="ml-auto">{formatDuration(hero)}</span>
                  </div>
                  {hero.snippet && (
                    <p className="mt-3 text-base leading-relaxed text-gray-500">
                      {hero.snippet}
                    </p>
                  )}
                </div>
              </div>
            </NextLink>
          )}

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

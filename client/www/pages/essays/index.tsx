import Head from 'next/head';
import NextLink from 'next/link';
import { LandingContainer, MainNav } from '@/components/marketingUi';
import * as og from '@/lib/og';
import { Footer } from '@/components/new-landing/Footer';
import { SectionTitle } from '@/components/new-landing/typography';
import {
  getAllSlugs,
  getPostBySlug,
  type Author,
  type Post,
} from '../../lib/posts';

export async function getStaticProps() {
  const posts = getAllSlugs()
    .map((slug) => getPostBySlug(slug))
    .filter((post) => !post.isDraft)
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    props: { posts },
  };
}

function shortName(name: string): string {
  const parts = name.split(' ');
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

function formatAuthors(authors: Author[]): string {
  if (authors.length === 1) return authors[0].name;
  return authors.map((author) => shortName(author.name)).join(' & ');
}

function formatDuration(post: Pick<Post, 'duration'>): string {
  const mins = post.duration.minutes;
  const label = post.duration.type;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return minutes > 0
      ? `${hours}h ${minutes}m ${label}`
      : `${hours}h ${label}`;
  }
  return `${mins} min ${label}`;
}

function AuthorAvatars({ authors }: { authors: Author[] }) {
  return (
    <div className="flex -space-x-1.5">
      {authors.map((author) =>
        author.avatar ? (
          <img
            key={author.name}
            src={author.avatar}
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
        ),
      )}
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
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
      <h3 className="text-lg leading-snug font-bold underline decoration-transparent decoration-2 underline-offset-4 transition-[text-decoration-color] duration-300 group-hover:decoration-current">
        {post.title}
      </h3>
      <div className="mt-3 flex items-center text-base text-gray-500">
        <span>{formatAuthors(post.authors)}</span>
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

export default function Page({ posts }: { posts: Post[] }) {
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
            <NextLink
              href="/rss.xml"
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3.75 3a.75.75 0 00-.75.75v.5c0 .414.336.75.75.75H4c6.075 0 11 4.925 11 11v.25c0 .414.336.75.75.75h.5a.75.75 0 00.75-.75V16C17 8.82 11.18 3 4 3h-.25z" />
                <path d="M3 8.75A.75.75 0 013.75 8H4a8 8 0 018 8v.25a.75.75 0 01-.75.75h-.5a.75.75 0 01-.75-.75V16a6 6 0 00-6-6h-.25A.75.75 0 013 9.25v-.5zM7 15a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </NextLink>
          </div>

          {hero && (
            <NextLink
              href={`/essays/${hero.slug}`}
              className="group block overflow-hidden border border-gray-200 bg-white transition-[box-shadow] hover:shadow-sm"
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr]">
                {hero.thumbnail && (
                  <div className="overflow-hidden">
                    <img
                      src={hero.thumbnail}
                      alt={hero.title}
                      className="aspect-[16/10] h-full w-full object-cover"
                    />
                  </div>
                )}
                <div className="flex flex-col justify-center p-6 md:p-8">
                  <h2 className="text-2xl leading-snug font-bold underline decoration-transparent decoration-2 underline-offset-4 transition-[text-decoration-color] duration-300 group-hover:decoration-current md:text-3xl">
                    {hero.title}
                  </h2>
                  <div className="mt-5 flex items-center text-base text-gray-500">
                    <AuthorAvatars authors={hero.authors} />
                    <span className="ml-2">{formatAuthors(hero.authors)}</span>
                    <span className="ml-auto">{formatDuration(hero)}</span>
                  </div>
                  {hero.summary && (
                    <p className="mt-3 text-base leading-relaxed text-gray-500">
                      {hero.summary}
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

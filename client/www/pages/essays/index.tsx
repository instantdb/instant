import format from 'date-fns/format';
import parse from 'date-fns/parse';
import Head from 'next/head';
import { getAllPosts, type Post } from '../../lib/posts';
import NextLink from 'next/link';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
} from '@/components/marketingUi';
import * as og from '@/lib/og';

export async function getStaticProps() {
  return {
    props: { posts: getAllPosts() },
  };
}

export default function Page({ posts }: { posts: Post[] }) {
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
        <MainNav />
        <div className="mx-auto mt-6 max-w-4xl flex-1 space-y-4 p-4">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold font-mono">Essays</h1>
            <NextLink
              href="/rss.xml"
              className="text-sm text-gray-600 hover:text-blue-500 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3.75 3a.75.75 0 00-.75.75v.5c0 .414.336.75.75.75H4c6.075 0 11 4.925 11 11v.25c0 .414.336.75.75.75h.5a.75.75 0 00.75-.75V16C17 8.82 11.18 3 4 3h-.25z"></path>
                <path d="M3 8.75A.75.75 0 013.75 8H4a8 8 0 018 8v.25a.75.75 0 01-.75.75h-.5a.75.75 0 01-.75-.75V16a6 6 0 00-6-6h-.25A.75.75 0 013 9.25v-.5zM7 15a2 2 0 11-4 0 2 2 0 014 0z"></path>
              </svg>
              RSS Feed
            </NextLink>
          </div>
          {posts
            .filter(({ isDraft }) => !isDraft)
            .map(({ title, slug, date, authors }, idx) => {
              return (
                <div key={slug} className="max-w-prose">
                  <div className={`mb-4 py-4`}>
                    <NextLink
                      href={`/essays/${slug}`}
                      className="hover:text-blue-500"
                    >
                      <h2 className="text-2xl font-bold font-mono leading-snug mb-2">
                        {title}
                      </h2>
                    </NextLink>
                    <div className="flex text-sm text-gray-500">
                      <span>
                        {authors.map((author, idx) => (
                          <span key={author.name}>
                            {author.name}
                            {idx !== authors.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </span>
                      <span className="mx-1">·</span>
                      {format(
                        parse(date, 'yyyy-MM-dd', new Date()),
                        'MMM do, yyyy',
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}

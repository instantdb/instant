import format from 'date-fns/format';
import parse from 'date-fns/parse';
import Head from 'next/head';
import { getAllPosts } from '../../lib/posts';
import NextLink from 'next/link';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  Post,
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
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <MainNav />
        <div className="mx-auto mt-6 max-w-4xl flex-1 space-y-4 p-4">
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

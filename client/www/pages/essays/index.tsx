import format from 'date-fns/format';
import parse from 'date-fns/parse';
import Head from 'next/head';
import { getAllPosts } from '../../lib/posts';
import NextLink from 'next/link';
import {
  H3,
  LandingContainer,
  LandingFooter,
  MainNav,
  Post,
} from '@/components/marketingUi';

export async function getStaticProps() {
  return {
    props: { posts: getAllPosts() },
  };
}

export default function Page({ posts }: { posts: Post[] }) {
  return (
    <LandingContainer>
      <Head>
        <title>Essays</title>
        <meta name="description" content="A Graph Database on the Client" />
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <MainNav />
        <div className="mx-auto mt-6 max-w-4xl flex-1 space-y-4 p-4">
          {posts.map(({ title, slug, date, author }, idx) => {
            return (
              <div key={slug}>
                <div className="mb-2">
                  <div
                    className={`mb-4 space-y-2 py-4 ${
                      idx !== posts.length - 1 ? 'border-b' : ''
                    }`}
                  >
                    <NextLink
                      href={`/essays/${slug}`}
                      className="hover:text-blue-500"
                    >
                      <H3>{title}</H3>
                    </NextLink>
                    <div className="flex justify-between text-xs font-bold uppercase text-gray-500">
                      <span className="font-bold uppercase">{author.name}</span>
                      {format(
                        parse(date, 'yyyy-MM-dd', new Date()),
                        'MMM do, yyyy',
                      )}
                    </div>
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

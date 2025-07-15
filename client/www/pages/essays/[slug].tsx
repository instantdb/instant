import format from 'date-fns/format';
import parse from 'date-fns/parse';
import Head from 'next/head';
import { getAllSlugs, getPostBySlug } from '../../lib/posts';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  PageProgressBar,
  type Post,
} from '@/components/marketingUi';
import * as og from '@/lib/og';
import ReactMarkdown from 'react-markdown';
import { Fence } from '@/components/ui';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { muxPattern, youtubeParams, youtubePattern } from '@/lib/videos';
import { isValidElement } from 'react';

const Post = ({ post }: { post: Post }) => {
  const { title, date, authors, hero, content } = post;
  return (
    <LandingContainer>
      <Head>
        <title>{title}</title>
        <meta key="og:title" property="og:title" content={title} />
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ title, section: 'blog' })}
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
          <h1 className="text-4xl font-medium leading-relaxed">{title}</h1>
          <div className="flex justify-between text-sm text-gray-500">
            <span className="space-x-2">
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
            {format(parse(date, 'yyyy-MM-dd', new Date()), 'MMM do, yyyy')}
          </div>
        </div>
        <div className="max-w-2xl mx-auto">
          {hero && <img src={hero} className="w-full rounded bg-gray-100" />}
        </div>
        <div className="prose prose-headings:font-medium prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-4 prose-h2:mb-2 prose-pre:bg-gray-100 mx-auto">
          <ReactMarkdown
            rehypePlugins={[rehypeRaw]}
            remarkPlugins={[remarkGfm]}
            components={{
              a(props) {
                if (props.hasOwnProperty('data-footnote-ref')) {
                  return <a {...props}>[{props.children}]</a>;
                }
                if (props.children !== '!video') {
                  return <a {...props} />;
                }

                const ytMatch = props.href?.match(youtubePattern);
                if (ytMatch) {
                  return (
                    <span className="md-video-container block">
                      <iframe
                        width="100%"
                        src={`https://www.youtube.com/embed/${ytMatch[1]}?${youtubeParams}`}
                        title="${title}"
                        allow="autoplay; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </span>
                  );
                }

                const muxMatch = props.href?.match(muxPattern);
                if (muxMatch) {
                  return (
                    <span className="md-video-container block">
                      <iframe
                        width="100%"
                        src={`https://stream.mux.com/${muxMatch[1]}`}
                        title="${title}"
                        allowFullScreen
                      ></iframe>
                    </span>
                  );
                }

                return <a {...props} />;
              },
              pre(props) {
                if (!isValidElement(props.children)) {
                  return <pre {...props} />;
                }
                const language =
                  (isValidElement(props.children) &&
                    props.children?.props.className?.replace(
                      'language-',
                      '',
                    )) ||
                  '';

                return (
                  <Fence
                    code={String(props.children.props.children).replace(
                      /\n$/,
                      '',
                    )}
                    language={language}
                  ></Fence>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
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
    props: { post: getPostBySlug(slug) },
  };
}

export default Post;

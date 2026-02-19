import {
  LandingContainer,
  MainNav,
  PageProgressBar,
} from '@/components/marketingUi';
import * as og from '@/lib/og';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import 'katex/dist/katex.min.css';
import Head from 'next/head';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { getAllSlugs, getPostBySlug, type Post } from '../../lib/posts';

import AgentsEssayDemoSection from '@/components/essays/agents_essay_demo_section';
import { GPT52Leaderboard } from '@/components/essays/GPT52Leaderboard';
import { Lightbox } from '@/components/Lightbox';

import { DemoIframe } from '@/components/DemoIframe';
import { SketchDemo } from '@/components/essays/sketch/SketchDemo';
import { Footer } from '@/components/new-landing/Footer';
import { Fence } from '@/components/ui';
import { muxPattern, youtubeParams, youtubePattern } from '@/lib/videos';
import { isValidElement } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

const Post = ({ post }: { post: Post }) => {
  const { title, date, authors, hero, content, og_image } = post;

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
      <div className="mt-6 space-y-4 p-4">
        <div className="mx-auto mb-4 max-w-prose py-4">
          <h1 className="mb-2 font-mono text-4xl leading-snug font-bold">
            {title}
          </h1>
          <div className="flex text-sm text-gray-500">
            <span>
              {authors.map((author, idx) => {
                return (
                  <span key={author.name}>
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
          <div className="mx-auto max-w-3xl">
            <img src={hero} className="w-full rounded-sm" />
          </div>
        )}
        <div className="prose prose-headings:font-mono prose-headings:font-bold prose-headings:leading-snug prose-h1:mb-4 prose-h1:mt-8 prose-h2:mb-2 prose-h2:mt-4 prose-pre:bg-gray-100 mx-auto">
          <ReactMarkdown
            rehypePlugins={[rehypeRaw, rehypeKatex]}
            remarkPlugins={[remarkGfm, remarkMath]}
            components={
              {
                // Note if you change the custom component key, you
                // must also change all references in the markdown files
                'agents-essay-demo-section': AgentsEssayDemoSection,
                'sketch-demo': (props: { demo: string }) => {
                  return <SketchDemo demo={props.demo} />;
                },
                'gpt52-leaderboard': GPT52Leaderboard,

                p: ({ children }) => (
                  <div className="prose mt-[1.25em] mb-[1.25em] text-base leading-relaxed">
                    {children}
                  </div>
                ),
                'demo-iframe': DemoIframe,
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
                img(props) {
                  const { src, alt, ...rest } = props;
                  if (src?.includes('?lightbox')) {
                    const cleanSrc = src.replace('?lightbox', '');
                    return <Lightbox src={cleanSrc} alt={alt} />;
                  }
                  return <img src={src} alt={alt} {...rest} />;
                },
              } as Components
            }
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
      <Footer />
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

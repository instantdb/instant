import {
  LandingContainer,
  MainNav,
  PageProgressBar,
} from '@/components/marketingUi';
import * as og from '@/lib/og';
import 'katex/dist/katex.min.css';
import Head from 'next/head';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { abbreviateAuthorName, formatDuration } from '../../lib/postUtils';
import { getAllSlugs, getPostBySlug, type Post } from '../../lib/posts';

import { TopWash } from '@/components/new-landing/TopWash';
import AgentsEssayDemoSection from '@/components/essays/agents_essay_demo_section';
import { GPT52Leaderboard } from '@/components/essays/GPT52Leaderboard';
import { Lightbox } from '@/components/Lightbox';
import MuxPlayer from '@mux/mux-player-react';

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
  const { title, authors, hero, content, og_image } = post;

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
      <div className="relative">
        <TopWash />
        <MainNav transparent />
        <div className="relative mx-auto max-w-4xl px-4 pt-28 pb-8 sm:pt-32">
        <div className="mx-auto mb-8 max-w-2xl">
          <h1 className="mb-4 text-5xl leading-tight font-normal tracking-tight">
            {title}
          </h1>
          <div className="flex items-center text-base text-gray-500">
            <span>
              {authors.map((author, idx) => {
                const name =
                  authors.length > 1
                    ? abbreviateAuthorName(author.name)
                    : author.name;
                return (
                  <span key={author.name}>
                    <a
                      className="underline decoration-transparent underline-offset-4 transition-[text-decoration-color] duration-300 hover:decoration-current"
                      href={author.url}
                      target="_blank"
                    >
                      {name}
                    </a>
                    {idx !== authors.length - 1 ? ' & ' : ''}
                  </span>
                );
              })}
            </span>
            <span className="ml-auto">{formatDuration(post)}</span>
          </div>
        </div>
        {hero && (
          <div className="mx-auto mb-10 max-w-3xl">
            <img src={hero} alt={title} className="w-full" />
          </div>
        )}
        <div className="essay-content prose prose-lg prose-headings:font-normal prose-headings:leading-snug prose-h1:mb-4 prose-h1:mt-12 prose-h2:mb-3 prose-h2:mt-8 mx-auto max-w-2xl">
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
                  <div className="prose prose-lg mt-[1.25em] mb-[1.25em] leading-relaxed">
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
                      <span className="md-video-container essay-video-breakout">
                        <iframe
                          width="100%"
                          src={`https://www.youtube.com/embed/${ytMatch[1]}?${youtubeParams}`}
                          title={title}
                          allow="autoplay; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </span>
                    );
                  }

                  const muxMatch = props.href?.match(muxPattern);
                  if (muxMatch) {
                    return (
                      <span
                        className="md-video-container essay-video-breakout overflow-hidden rounded-2xl"
                        style={{ paddingBottom: 0, border: 'none' }}
                      >
                        <MuxPlayer
                          playbackId={muxMatch[1]}
                          accentColor="#ea580c"
                          style={{ aspectRatio: '16/9', display: 'block' }}
                        />
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
                      style={{ backgroundColor: '#faf8f5' }}
                    ></Fence>
                  );
                },
                img(props) {
                  const { src, alt, className, ...rest } = props;
                  const resolvedClassName = className
                    ? className
                    : 'essay-image-breakout';
                  if (src?.includes('?lightbox')) {
                    const cleanSrc = src.replace('?lightbox', '');
                    return (
                      <Lightbox
                        src={cleanSrc}
                        alt={alt}
                        className={resolvedClassName}
                      />
                    );
                  }
                  return (
                    <img
                      src={src}
                      alt={alt}
                      className={resolvedClassName}
                      {...rest}
                    />
                  );
                },
              } as Components
            }
          >
            {content}
          </ReactMarkdown>
        </div>
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

import Link from 'next/link';
import Head from 'next/head';
import { MainNav } from '@/components/marketingUi';
import { TopWash } from '@/components/new-landing/TopWash';
import ReactMarkdown, { Components } from 'react-markdown';
import { Fence } from '@/components/ui';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import { youtubeParams, youtubePattern } from '@/lib/videos';
import { ArrowLeftIcon } from '@heroicons/react/24/solid';
import { isValidElement } from 'react';
import {
  ExampleApp,
  getAllSlugs,
  getExampleAppBySlug,
} from '@/lib/examples/server';
import RatingBox from '@/components/docs/RatingBox';
import { Footer } from '@/components/new-landing/Footer';

const buttonVariants = {
  cta: 'border border-transparent bg-orange-600 text-white hover:bg-orange-700',
  secondary: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
};

function ActionButtons({ app }: { app: ExampleApp }) {
  const { youtubeVideoId, githubUrl } = app;
  const youtubeUrl = !youtubeVideoId
    ? null
    : `https://www.youtube.com/watch?v=${youtubeVideoId}`;
  return (
    <>
      {!youtubeUrl ? null : (
        <a
          href={youtubeUrl}
          className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${buttonVariants.cta}`}
        >
          Watch Tutorial
        </a>
      )}
      <a
        href={githubUrl}
        className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${!youtubeVideoId ? buttonVariants.cta : buttonVariants.secondary}`}
      >
        See Code
      </a>
    </>
  );
}

function Content({ content }: { content: string }) {
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeRaw, rehypeSlug]}
      remarkPlugins={[remarkGfm]}
      components={
        {
          p: ({ children }) => (
            <div className="prose prose-lg mt-[1.25em] mb-[1.25em] leading-relaxed">
              {children}
            </div>
          ),
          file: ({ label }: { label: string }) => (
            <div className="-mb-3 ml-1 text-sm font-bold text-gray-600/50">
              {label}
            </div>
          ),
          a(props) {
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
                    title="Video"
                    allow="autoplay; picture-in-picture"
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
                props.children?.props.className?.replace('language-', '')) ||
              '';

            return (
              <Fence
                code={String(props.children.props.children).replace(/\n$/, '')}
                language={language}
                style={{ backgroundColor: '#faf8f5' }}
              ></Fence>
            );
          },
        } as Components
      }
    >
      {content}
    </ReactMarkdown>
  );
}

function ExampleDetail({ app }: { app: ExampleApp }) {
  const { slug, title, content, shortDescription, platform } = app;
  const backHref = platform === 'mobile' ? '/examples?tab=mobile' : '/examples';
  return (
    <div className="relative mx-auto max-w-4xl px-4 pt-28 pb-8 sm:pt-32">
      <div className="mx-auto mb-8 max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <Link href={backHref} className="text-sm text-gray-500">
            <ArrowLeftIcon className="mr-1 mb-0.5 inline h-4 w-4" />
            Back To Examples
          </Link>
          <div className="flex gap-3">
            <ActionButtons app={app} />
          </div>
        </div>
        <h1 className="text-5xl leading-tight font-normal tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-lg text-gray-500">{shortDescription}</p>
      </div>
      <div className="essay-content prose prose-lg prose-headings:font-normal prose-headings:leading-snug prose-h1:mb-4 prose-h1:mt-12 prose-h2:mb-3 prose-h2:mt-8 mx-auto max-w-2xl">
        <Content content={content} />
      </div>
      <div className="mx-auto mt-8 max-w-2xl border border-dashed border-orange-600 bg-orange-50/50 px-4 pt-2 pb-4">
        <div className="py-4 text-sm font-light">
          What did you think of this example? Are there any other apps you'd
          like to see implemented with InstantDB? Let us know and we'll do our
          best to add it!
        </div>
        <RatingBox pageId={`examples/${slug}`} />
      </div>
    </div>
  );
}

const ExampleAppPage = ({ app }: { app: ExampleApp }) => {
  const { title } = app;
  const pageTitle = `${title} | InstantDB Examples`;
  return (
    <div className="min-h-full overflow-x-hidden">
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Learn Instant through example apps" />
      </Head>
      <div className="relative">
        <TopWash />
        <MainNav transparent />
        <ExampleDetail app={app} />
      </div>
      <Footer />
    </div>
  );
};

export async function getStaticPaths() {
  return {
    paths: getAllSlugs().map((slug) => `/examples/${slug}`),
    fallback: false,
  };
}

export async function getStaticProps({
  params: { slug },
}: {
  params: { slug: string };
}) {
  return {
    props: { app: getExampleAppBySlug(slug) },
  };
}

export default ExampleAppPage;

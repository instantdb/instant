import Link from 'next/link';
import Head from 'next/head';
import { Button } from '@/components/ui';
import {
  LandingFooter,
  LandingContainer,
  MainNav,
  Section,
} from '@/components/marketingUi';
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

function ActionButtons({ app }: { app: ExampleApp }) {
  const { youtubeVideoId, githubUrl } = app;
  const youtubeUrl = !youtubeVideoId
    ? null
    : `https://www.youtube.com/watch?v=${youtubeVideoId}`;
  const githubVariant = !youtubeVideoId ? 'cta' : 'secondary';
  const githubSize = !youtubeVideoId ? 'normal' : 'mini';
  return (
    <>
      {!youtubeUrl ? null : (
        <Button type="link" href={youtubeUrl} variant="cta">
          Watch Tutorial
        </Button>
      )}
      <Button
        size={githubSize}
        type="link"
        href={githubUrl}
        variant={githubVariant}
      >
        See Code
      </Button>
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
            <div className="mt-[1.25em] mb-[1.25em] text-base leading-relaxed">
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
  const backHref =
    platform === 'mobile' ? '/examples?tab=mobile' : '/examples';
  return (
    <div className="space-y-12 md:space-y-6">
      <div className="mx-auto flex max-w-prose flex-col">
        <div className="pt-6 pb-2">
          <Link href={backHref} className="text-sm text-gray-500">
            <ArrowLeftIcon className="mr-1 mb-0.5 inline h-4 w-4" />
            Back To Examples
          </Link>
        </div>
        <div className="py-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="-mt-1 text-3xl leading-relaxed font-bold">
              {title}
            </div>
            <div className="hidden gap-4 md:flex">
              <ActionButtons app={app} />
            </div>
          </div>
          <p className="text-md text-gray-700">{shortDescription}</p>
        </div>
        <div className="flex gap-4 md:hidden">
          <ActionButtons app={app} />
        </div>
        <div className="prose prose-headings:font-bold prose-headings:leading-relaxed prose-h1:mb-4 prose-h1:mt-8 prose-h1:text-xl prose-h2:mb-2 prose-h2:mt-4 prose-h2:text-lg prose-pre:bg-gray-100">
          <Content content={content} />
        </div>
        <div className="my-4 border border-dashed border-orange-600 bg-orange-50/50 px-4 pt-2 pb-4">
          <div className="py-4 text-sm font-light">
            What did you think of this example? Are there any other apps you'd
            like to see implemented with InstantDB? Let us know and we'll do our
            best to add it!
          </div>
          <RatingBox pageId={`examples/${slug}`} />
        </div>
      </div>
    </div>
  );
}

const ExampleAppPage = ({ app }: { app: ExampleApp }) => {
  const { title } = app;
  const pageTitle = `${title} | InstantDB Examples`;
  return (
    <LandingContainer>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Learn Instant through example apps" />
      </Head>
      <MainNav />
      <Section>
        <ExampleDetail app={app} />
      </Section>
      <div className="h-12" />
      <LandingFooter />
    </LandingContainer>
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

import 'katex/dist/katex.min.css';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

import AgentsEssayDemoSection from '@/components/essays/agents_essay_demo_section';
import { GPT52Leaderboard } from '@/components/essays/GPT52Leaderboard';
import { Lightbox } from '@/components/Lightbox';
import MuxPlayer from '@mux/mux-player-react';

import { DemoIframe } from '@/components/DemoIframe';
import { SketchDemo } from '@/components/essays/sketch/SketchDemo';
import { Fence } from '@/components/ui';
import { muxPattern, youtubeParams, youtubePattern } from '@/lib/videos';
import { isValidElement } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

export function EssayMarkdown({
  content,
  title,
}: {
  content: string;
  title: string;
}) {
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      remarkPlugins={[remarkGfm, remarkMath]}
      components={
        {
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
  );
}

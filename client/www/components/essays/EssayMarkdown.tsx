import 'katex/dist/katex.min.css';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

import AgentsEssayDemoSection from '@/components/essays/agents_essay_demo_section';
import TodoCodeDemo, {
  TODO_CODE_LINE_COUNT,
} from '@/components/essays/todo_code_demo';
import TodoIframeDemo from '@/components/essays/todo_iframe_demo';
import { GPT52Leaderboard } from '@/components/essays/GPT52Leaderboard';
import { Lightbox } from '@/components/Lightbox';
import { TripleDemo } from '@/components/about/TripleDemo';
import { DatalogDemo } from '@/components/about/DatalogDemo';
import PendingQueueDemo from '@/components/essays/pending_queue_demo';
import MuxPlayer from '@mux/mux-player-react';

import { DemoIframe } from '@/components/DemoIframe';
import { SketchDemo } from '@/components/essays/sketch/SketchDemo';
import { Demos, type DemoState } from '@/components/essays/architecture/Demos';
import { Fence } from '@/components/ui';
import { muxPattern, youtubeParams, youtubePattern } from '@/lib/videos';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { isValidElement, useState } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

function DatalogEssayDemo() {
  const [filterValue, setFilterValue] = useState(true);
  return (
    <div className="not-prose my-8 flex justify-center">
      <DatalogDemo
        filterValue={filterValue}
        onToggleFilter={() => setFilterValue((v) => !v)}
        layout="horizontal"
      />
    </div>
  );
}

export function EssayMarkdown({
  content,
  title,
}: {
  content: string;
  title: string;
}) {
  const [demoState, setDemoState] = useLocalStorage<DemoState>(
    'architecture-essay-demo',
    {},
  );
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      remarkPlugins={[remarkGfm, remarkMath]}
      components={
        {
          // Note if you change the custom component key, you
          // must also change all references in the markdown files
          'agents-essay-demo-section': AgentsEssayDemoSection,
          'todo-iframe-demo': TodoIframeDemo,
          'todo-code-demo': TodoCodeDemo,
          'todo-code-line-count': () => <>{TODO_CODE_LINE_COUNT}</>,
          'sketch-demo': (props: { demo: string }) => {
            return <SketchDemo demo={props.demo} />;
          },
          'architecture-demo': (props: { demo: string }) => (
            <Demos
              demo={props.demo}
              demoState={demoState}
              setDemoState={setDemoState}
            />
          ),
          'gpt52-leaderboard': GPT52Leaderboard,
          'triple-demo': () => (
            <div className="not-prose my-8 flex justify-center">
              <TripleDemo />
            </div>
          ),
          'datalog-demo': DatalogEssayDemo,
          'pending-queue-demo': () => (
            <div className="not-prose my-8 flex justify-center">
              <PendingQueueDemo />
            </div>
          ),

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

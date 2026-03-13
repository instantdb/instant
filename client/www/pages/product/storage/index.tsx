import { useState, useRef, type ReactNode } from 'react';
import Highlight, { defaultProps } from 'prism-react-renderer';
import Head from 'next/head';
import * as og from '@/lib/og';
import { MainNav, ProductNav } from '@/components/marketingUi';
import { cn } from '@/components/ui';
import {
  storageExamples,
  permissionExamples,
} from '@/lib/product/storage/examples';
import { Section } from '@/components/new-landing/Section';
import {
  LandingButton,
  SectionTitle,
  SectionSubtitle,
  Subheading,
} from '@/components/new-landing/typography';
import { Footer } from '@/components/new-landing/Footer';
import { TopWash } from '@/components/new-landing/TopWash';
import { AnimateIn } from '@/components/new-landing/AnimateIn';

function MusicApp() {
  const [playing, setPlaying] = useState(false);
  const tracks = [
    { title: 'Midnight City', artist: 'M83', duration: '4:03' },
    { title: 'Intro', artist: 'The xx', duration: '2:07' },
    { title: 'Tadow', artist: 'Masego & FKJ', duration: '5:48' },
    { title: 'Rhiannon', artist: 'Fleetwood Mac', duration: '4:13' },
  ];
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <style>{`
        @keyframes equalize {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
      `}</style>
      <div className="flex items-center gap-3 border-b bg-gray-950 px-4 py-3">
        <div className="h-10 w-10 rounded bg-gradient-to-br from-purple-500 to-pink-500" />
        <div>
          <p className="text-xs font-medium text-white">Now Playing</p>
          <p className="text-[10px] text-gray-400">Midnight City - M83</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {playing && (
            <div className="flex items-end gap-[3px] h-4">
              {[0, 0.2, 0.4, 0.1].map((delay, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-sm bg-purple-400"
                  style={{
                    animation: `equalize 0.8s ease-in-out ${delay}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
          <button
            onClick={() => setPlaying(!playing)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {playing ? (
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <div className="divide-y">
        {tracks.map((t, i) => (
          <div key={t.title} className="flex items-center gap-3 px-4 py-2">
            <span className="w-4 text-[10px] text-gray-300">{i + 1}</span>
            <div className="h-7 w-7 rounded bg-gradient-to-br from-gray-100 to-gray-200" />
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-800">{t.title}</p>
              <p className="text-[10px] text-gray-400">{t.artist}</p>
            </div>
            <span className="text-[10px] text-gray-400">{t.duration}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function animateHeart(target: HTMLElement) {
  const count = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.innerText = '❤️';
    target.appendChild(el);

    const size = 14 + Math.random() * 14;
    const xDrift = (Math.random() - 0.5) * 60;
    const yDist = -(50 + Math.random() * 40);
    const delay = i * 60;
    const duration = 600 + Math.random() * 300;
    const rotation = (Math.random() - 0.5) * 40;

    Object.assign(el.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      fontSize: `${size}px`,
      lineHeight: '1',
      pointerEvents: 'none',
      zIndex: '9999',
      transform: 'translate(-50%, -50%) scale(0)',
      opacity: '1',
      transition: `transform ${duration}ms cubic-bezier(0.2, 0.6, 0.3, 1), opacity ${duration}ms ease-out`,
      transitionDelay: `${delay}ms`,
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        Object.assign(el.style, {
          transform: `translate(calc(-50% + ${xDrift}px), calc(-50% + ${yDist}px)) scale(1) rotate(${rotation}deg)`,
          opacity: '0',
        });
      });
    });

    setTimeout(() => el.remove(), duration + delay + 50);
  }
}

function PhotoApp() {
  const heartRef = useRef<HTMLDivElement>(null);

  const handleHeartClick = () => {
    if (heartRef.current) animateHeart(heartRef.current);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-lg px-3 py-2">
        <img
          src="/img/landing/stopa.jpg"
          alt="stopa"
          className="h-7 w-7 rounded-full object-cover"
        />
        <span className="text-xs font-semibold text-gray-900">stopa</span>
      </div>
      {/* Photo */}
      <div className="relative aspect-square w-full">
        <img
          src="/img/landing/dog-post.jpg"
          alt="Dog licking a spoon"
          className="h-full w-full object-cover"
        />
        {/* Heart button */}
        <div
          ref={heartRef}
          className="absolute -right-2 -bottom-3"
          style={{ overflow: 'visible' }}
        >
          <button
            onClick={handleHeartClick}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xl shadow-sm transition-transform hover:shadow-md active:scale-90"
          >
            ❤️
          </button>
        </div>
      </div>
      {/* Caption */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-xs text-gray-800">
          <span className="font-semibold">stopa</span>{' '}
          <span className="text-gray-600">Newest member of the team</span>
        </p>
      </div>
    </div>
  );
}

const books = [
  {
    title: 'How to Win Friends',
    author: 'Dale Carnegie',
    cover: '/img/product-pages/storage/book-1.webp',
  },
  {
    title: '7 Habits',
    author: 'Stephen Covey',
    cover: '/img/product-pages/storage/book-5.webp',
  },
  {
    title: 'East of Eden',
    author: 'John Steinbeck',
    cover: '/img/product-pages/storage/book-3.webp',
  },
  {
    title: 'Antifragile',
    author: 'Nassim Taleb',
    cover: '/img/product-pages/storage/book-4.webp',
  },
  {
    title: 'SICP',
    author: 'Abelson & Sussman',
    cover: '/img/product-pages/storage/book-2.webp',
  },
  {
    title: 'Hackers & Painters',
    author: 'Paul Graham',
    cover: '/img/product-pages/storage/book-6.webp',
  },
];

function BookApp() {
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <img
          src="/img/product-pages/storage/zeneca-icon.webp"
          alt="Zeneca"
          className="h-4 w-4"
        />
        <span className="text-xs font-medium text-gray-700">Zeneca</span>
      </div>
      <div className="grid grid-cols-3 gap-3 p-4">
        {books.map((b) => (
          <div key={b.title} className="flex flex-col gap-1">
            <img
              src={b.cover}
              alt={b.title}
              className="aspect-[2/3] rounded object-cover"
            />
            <p className="truncate text-[10px] text-gray-500">{b.author}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const appDemos = [
  { label: 'Photos', component: PhotoApp },
  { label: 'Music', component: MusicApp },
  { label: 'Books', component: BookApp },
];

const cardStyles = [
  'rotate-[-2.5deg] translate-y-2',
  'z-10',
  'rotate-[1.5deg] translate-y-4',
];

function AppGallery() {
  return (
    <div
      className="grid justify-center"
      style={{ gridTemplateColumns: 'repeat(3, minmax(0, 240px))' }}
    >
      {appDemos.map((demo, i) => {
        const Demo = demo.component;
        return (
          <div key={demo.label} className={cn('w-[240px]', cardStyles[i])}>
            <Demo />
          </div>
        );
      })}
    </div>
  );
}

function PillTray({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-gray-200/60 p-1.5">
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

const editorTheme = {
  plain: {
    backgroundColor: '#faf8f5',
    color: '#575279',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'cdata', 'punctuation'],
      style: { color: '#797593' },
    },
    {
      types: ['delimiter', 'important', 'atrule', 'operator', 'keyword'],
      style: { color: '#286983' },
    },
    {
      types: [
        'tag',
        'doctype',
        'variable',
        'regex',
        'class-name',
        'selector',
        'inserted',
      ],
      style: { color: '#56949f' },
    },
    {
      types: ['boolean', 'entity', 'number', 'symbol', 'function'],
      style: { color: '#d7827e' },
    },
    {
      types: ['string', 'char', 'property', 'attr-value'],
      style: { color: '#ea9d34' },
    },
    {
      types: ['parameter', 'url', 'attr-name', 'builtin'],
      style: { color: '#907aa9' },
    },
    { types: ['deleted'], style: { color: '#b4637a' } },
  ],
};

function CodeEditor({ code, language }: { code: string; language: string }) {
  return (
    <Highlight
      {...defaultProps}
      code={code.trimEnd()}
      language={language as any}
      theme={editorTheme}
    >
      {({ tokens, getTokenProps }) => (
        <pre
          className="m-0 p-4 font-mono text-sm leading-relaxed"
          style={{ backgroundColor: '#faf8f5' }}
        >
          <code>
            {tokens.map((line, lineIndex) => (
              <span key={lineIndex} className="flex">
                <span className="inline-block w-8 shrink-0 text-right text-gray-400/60 select-none">
                  {lineIndex + 1}
                </span>
                <span className="ml-4 flex-1">
                  {line
                    .filter((token) => !token.empty)
                    .map((token, tokenIndex) => {
                      const { key, ...props } = getTokenProps({ token });
                      return <span key={key || tokenIndex} {...props} />;
                    })}
                </span>
              </span>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}

function TabbedCodeExample({
  examples,
  tabs,
  height = 'h-72',
}: {
  examples: { label: string; [key: string]: string }[];
  tabs: { key: string; label: string; language?: string }[];
  height?: string;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeTabKey, setActiveTabKey] = useState(tabs[0].key);
  const example = examples[selectedIdx];
  const activeTab = tabs.find((t) => t.key === activeTabKey) || tabs[0];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PillTray>
        {examples.map((ex, i) => (
          <button
            key={ex.label}
            onClick={() => setSelectedIdx(i)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              i === selectedIdx
                ? 'border-orange-600 bg-orange-600 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            {ex.label}
          </button>
        ))}
      </PillTray>
      <div
        className="min-w-0 overflow-hidden rounded-lg border border-gray-200"
        style={{ backgroundColor: '#faf8f5' }}
      >
        <div className="flex border-b border-gray-200/60">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTabKey(tab.key)}
              className={cn(
                'border-r border-r-gray-200/60 px-4 py-2 text-sm font-medium transition-colors',
                activeTabKey === tab.key
                  ? 'text-gray-900 shadow-[inset_0_-2px_0_0_#f97316]'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={cn(height, 'overflow-auto text-sm')}>
          <CodeEditor
            language={activeTab.language || 'javascript'}
            code={example[activeTab.key]}
          />
        </div>
      </div>
    </div>
  );
}

export default function Storage() {
  const title = 'Storage - Instant';
  const description =
    'Digital content is just another table in your database. No separate service needed.';

  return (
    <div className="text-off-black w-full overflow-x-auto">
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta key="og:title" property="og:title" content={title} />
        <meta
          key="og:description"
          property="og:description"
          content={description}
        />
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ title: 'Storage', section: 'Product' })}
        />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <MainNav transparent />

      {/* Hero */}
      <div className="relative pt-16">
        <TopWash />
        <ProductNav currentSlug="storage" />
        <Section className="relative pt-12 pb-6 sm:pt-16 sm:pb-10">
          <div className="flex flex-col items-center text-center">
            <SectionTitle>
              File storage and data <br className="hidden md:block" />
              <span className="text-orange-600">in one place.</span>
            </SectionTitle>
            <SectionSubtitle>{description}</SectionSubtitle>
            <div className="mt-8 flex gap-3">
              <LandingButton href="/dash">Get started</LandingButton>
              <LandingButton href="/docs/storage" variant="secondary">
                Read the docs
              </LandingButton>
            </div>
          </div>
        </Section>
      </div>

      {/* Features */}
      <Section className="pb-0 sm:pb-0">
        <div className="space-y-24">
          {/* No need for a separate file storage system */}
          <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
            <div className="space-y-4 md:max-w-[400px]">
              <Subheading>No need for a separate file storage system</Subheading>
              <p className="mt-2 text-base">
                Instant comes with built-in file storage. No S3 buckets to
                configure, no signed URLs to manage.
              </p>
              <p className="mt-2 text-base">
                When you've got storage with your database you can easily
                build apps like Instagram, Spotify, Goodreads and more!
              </p>
            </div>
            <div className="min-w-0 grow lg:bg-radial lg:from-white lg:to-[#FFF9F4] lg:px-[66px] lg:py-[37px]">
              <AppGallery />
            </div>
          </div>

          {/* Files are integrated into your database */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center">
              <div className="lg:bg-surface/20 min-w-0 grow lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={storageExamples}
                  tabs={[{ key: 'code', label: 'Code' }]}
                  height="h-80"
                />
              </div>
              <div className="space-y-4 md:max-w-[440px]">
                <Subheading>Files are integrated into your database</Subheading>
                <p className="mt-2 text-base">
                  Files are stored alongside other entities in Instant. Upload
                  them, link them to your data, and query with InstaQL just
                  like any other table.
                </p>
                <p className="mt-2 text-base">
                  Best of all, your files are reactive too! When a file is
                  updated or deleted, your UI updates in real-time.
                </p>
              </div>
            </div>
          </AnimateIn>

          {/* Secure with permissions */}
          <AnimateIn>
            <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
              <div className="space-y-4 md:max-w-[400px]">
                <Subheading>Secure with permissions</Subheading>
                <p className="mt-2 text-base">
                  Files use the same permission system as the rest of your
                  data. Control who can upload, view, and delete files with
                  simple rules.
                </p>
                <p className="mt-2 text-base">
                  Your rules can traverse relationships, check auth state, and
                  enforce access at every level. No server endpoints needed.
                </p>
              </div>
              <div className="min-w-0 grow lg:bg-[#F0F5FA] lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={permissionExamples}
                  tabs={[{ key: 'code', label: 'Rules', language: 'typescript' }]}
                  height="h-96"
                />
              </div>
            </div>
          </AnimateIn>
        </div>
      </Section>

      {/* CTA */}
      <div className="relative overflow-hidden bg-[#F0F5FA]">
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-48 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        <Section className="relative z-10">
          <AnimateIn>
            <div className="text-center">
              <SectionTitle>
                <span className="text-orange-600">
                  Build rich applications
                </span>
                <br className="hidden md:block" /> with files and data
                together.
              </SectionTitle>
              <div className="mt-10 flex justify-center gap-3">
                <LandingButton href="/dash">Get started</LandingButton>
                <LandingButton href="/docs/storage" variant="secondary">
                  Read the docs
                </LandingButton>
              </div>
            </div>
          </AnimateIn>
        </Section>
      </div>

      <Footer />
    </div>
  );
}

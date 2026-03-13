import { useState, useRef, useEffect } from 'react';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid';
import { AnimatePresence, motion } from 'motion/react';
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
import { TabbedCodeExample } from '@/components/new-landing/TabbedCodeExample';
import { PreviewPlayer, tracks } from '@/lib/product/storage/musicPreview';

function MusicApp() {
  const [activeTrack, setActiveTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<PreviewPlayer | null>(null);
  const activeTrackRef = useRef(activeTrack);
  activeTrackRef.current = activeTrack;

  const getPlayer = () => {
    if (!playerRef.current) {
      const player = new PreviewPlayer();
      player.onTrackEnd = () => {
        const next = (activeTrackRef.current + 1) % tracks.length;
        setActiveTrack(next);
        player.play(next);
      };
      playerRef.current = player;
    }
    return playerRef.current;
  };

  useEffect(() => {
    return () => {
      playerRef.current?.stop();
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <style>{`
        @keyframes equalize {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
      `}</style>
      <div className="flex items-center gap-3 border-b px-3 py-2.5">
        <button
          onClick={() => {
            const player = getPlayer();
            if (playing) {
              player.pause();
            } else {
              player.play(activeTrack);
            }
            setPlaying(!playing);
          }}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-800"
        >
          {playing ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="ml-0.5 h-4 w-4" />
          )}
        </button>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-gray-900">
            My favorite songs
          </p>
          <div className="mt-0.5 flex items-center gap-1">
            <img
              src="/img/landing/joe.jpg"
              className="h-4 w-4 rounded-full object-cover"
            />
            <span className="text-[10px] text-gray-500">Joe</span>
          </div>
        </div>
      </div>
      <div className="max-h-[180px] divide-y overflow-y-auto">
        {tracks.map((t, i) => {
          const isActive = i === activeTrack;
          return (
            <div
              key={t.title}
              onClick={() => {
                const player = getPlayer();
                setActiveTrack(i);
                setPlaying(true);
                player.play(i);
              }}
              className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
            >
              <div className="flex w-4 items-center justify-center">
                {isActive && playing ? (
                  <div className="flex h-3 items-end gap-[2px]">
                    {[-0.4, -0.25, -0.35].map((delay, j) => (
                      <div
                        key={j}
                        className="w-[2.5px] rounded-sm bg-gray-900"
                        style={{
                          animation: `equalize 0.8s ease-in-out ${delay}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] text-gray-400">{i + 1}</span>
                )}
              </div>
              <div className="flex-1">
                <p
                  className={cn(
                    'text-xs font-medium',
                    isActive ? 'text-gray-900' : 'text-gray-600',
                  )}
                >
                  {t.title}
                </p>
                <p className="text-[10px] text-gray-400">{t.artist}</p>
              </div>
            </div>
          );
        })}
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
    title: 'How to Win Friends and Influence People',
    author: 'Dale Carnegie',
    cover: '/img/product-pages/storage/book-1.webp',
    description:
      "Dale Carnegie's rock-solid, time-tested advice has carried countless people up the ladder of success in their business and personal lives.",
  },
  {
    title: 'The 7 Habits of Highly Effective People',
    author: 'Stephen R. Covey',
    cover: '/img/product-pages/storage/book-5.webp',
    description:
      'A leading management consultant outlines seven organizational rules for improving effectiveness and increasing productivity at work and at home.',
  },
  {
    title: 'East of Eden',
    author: 'John Steinbeck',
    cover: '/img/product-pages/storage/book-3.webp',
    description:
      "A masterpiece of Biblical scope, and the magnum opus of one of America's most enduring authors. Set in the rich farmland of California's Salinas Valley.",
  },
  {
    title: 'Antifragile',
    author: 'Nassim Nicholas Taleb',
    cover: '/img/product-pages/storage/book-4.webp',
    description:
      'Shares insights into how adversity can bring out the best in individuals and communities, drawing on multiple disciplines.',
  },
  {
    title: 'Structure and Interpretation of Computer Programs',
    author: 'Harold Abelson & Gerald Jay Sussman',
    cover: '/img/product-pages/storage/book-2.webp',
    description:
      'The foundational computer science textbook, licensed under Creative Commons. A deep dive into the simplicity behind our craft.',
  },
  {
    title: 'Hackers & Painters',
    author: 'Paul Graham',
    cover: '/img/product-pages/storage/book-6.webp',
    description:
      'Big ideas from the computer age. We are living in a world increasingly designed and engineered by computer programmers and software.',
  },
];

function BookApp() {
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const book = selectedBook !== null ? books[selectedBook] : null;

  return (
    <div className="relative rounded-lg border bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <img
          src="/img/product-pages/storage/zeneca-icon.webp"
          alt="Zeneca"
          className="h-4 w-4"
        />
        <span className="text-xs font-medium text-gray-700">Zeneca</span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-6 px-4 py-4">
        {books.map((b, i) => (
          <div key={b.title}>
            <img
              src={b.cover}
              alt={b.title}
              className="aspect-[2/3] cursor-pointer rounded object-cover transition-transform duration-300 hover:scale-[0.98]"
              onClick={() => setSelectedBook(i)}
            />
          </div>
        ))}
      </div>
      <AnimatePresence>
        {book && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedBook(null)}
            />
            <motion.div
              className="absolute top-1/2 left-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <button
                onClick={() => setSelectedBook(null)}
                className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                &times;
              </button>
              <div className="flex gap-5">
                <img
                  src={book.cover}
                  alt={book.title}
                  className="h-44 w-28 flex-shrink-0 rounded-lg object-cover shadow-md"
                />
                <div className="flex min-w-0 flex-col">
                  <p className="text-lg leading-snug font-bold text-gray-900">
                    {book.title}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">{book.author}</p>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600">
                    {book.description}
                  </p>
                  <a
                    href={`https://www.amazon.com/s?k=${encodeURIComponent(book.title + ' ' + book.author)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Get it on Amazon
                  </a>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const appDemos = [
  { label: 'Music', component: MusicApp },
  { label: 'Books', component: BookApp },
  { label: 'Photos', component: PhotoApp },
];

const cardStyles = [
  'rotate-[-2.5deg] translate-y-2 justify-self-start',
  'z-10 justify-self-center',
  'rotate-[1.5deg] translate-y-4 justify-self-end',
];

function AppGallery() {
  return (
    <div className="mx-auto grid max-w-[740px] items-end">
      {appDemos.map((demo, i) => {
        const Demo = demo.component;
        return (
          <div
            key={demo.label}
            className={cn('col-start-1 row-start-1 w-[240px]', cardStyles[i])}
          >
            <Demo />
          </div>
        );
      })}
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
              <Subheading>
                No need for a separate file storage system
              </Subheading>
              <p className="mt-2 text-base">
                Instant comes with built-in file storage. No S3 buckets to
                configure, no signed URLs to manage.
              </p>
              <p className="mt-2 text-base">
                When you've got storage with your database you can easily build
                apps like Instagram, Spotify, Goodreads and more!
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
                  them, link them to your data, and query with InstaQL just like
                  any other table.
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
                  Files use the same permission system as the rest of your data.
                  Control who can upload, view, and delete files with simple
                  rules.
                </p>
                <p className="mt-2 text-base">
                  Your rules can traverse relationships, check auth state, and
                  enforce access at every level. No server endpoints needed.
                </p>
              </div>
              <div className="min-w-0 grow lg:bg-[#F0F5FA] lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={permissionExamples}
                  tabs={[
                    { key: 'code', label: 'Rules', language: 'typescript' },
                  ]}
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
                <span className="text-orange-600">Build rich applications</span>
                <br className="hidden md:block" /> with files and data together.
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

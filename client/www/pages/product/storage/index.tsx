import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Head from 'next/head';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  ProductNav,
  SectionWide,
} from '@/components/marketingUi';
import { Button, Fence, cn } from '@/components/ui';
import {
  storageExamples,
  permissionExamples,
} from '@/lib/product/storage/examples';

function MusicApp() {
  const tracks = [
    { title: 'Midnight City', artist: 'M83', duration: '4:03' },
    { title: 'Intro', artist: 'The xx', duration: '2:07' },
    { title: 'Tadow', artist: 'Masego & FKJ', duration: '5:48' },
    { title: 'Rhiannon', artist: 'Fleetwood Mac', duration: '4:13' },
  ];
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="flex items-center gap-3 border-b bg-gray-950 px-4 py-3">
        <div className="h-10 w-10 rounded bg-gradient-to-br from-purple-500 to-pink-500" />
        <div>
          <p className="text-xs font-medium text-white">Now Playing</p>
          <p className="text-[10px] text-gray-400">Midnight City - M83</p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-gray-400">
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
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

const logos = [
  { src: '/img/icon/logo-512.svg', alt: 'Instant', bg: 'bg-orange-500' },
  {
    src: '/img/product-pages/sync/figma.svg',
    alt: 'Figma',
    bg: 'bg-purple-100',
  },
  {
    src: '/img/product-pages/sync/notion.svg',
    alt: 'Notion',
    bg: 'bg-orange-50',
  },
  {
    src: '/img/product-pages/storage/linear-white.svg',
    alt: 'Linear',
    bg: 'bg-gray-950',
  },
];

function PhotoApp() {
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <img
          src="/img/icon/logo-512.svg"
          alt="Instant"
          className="h-6 w-6 rounded-full"
        />
        <span className="text-xs font-medium text-gray-700">instant</span>
      </div>
      <div className="grid grid-cols-2 gap-0.5 p-0.5">
        {logos.map((logo) => (
          <div
            key={logo.alt}
            className={`flex aspect-square items-center justify-center ${logo.bg}`}
          >
            <img
              src={logo.src}
              alt={logo.alt}
              className="h-24 w-24 object-contain"
            />
          </div>
        ))}
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

function AppGallery() {
  return (
    <div className="relative h-[420px]">
      <div className="absolute top-0 left-0 z-30 w-[75%] rotate-[-2deg]">
        <PhotoApp />
      </div>
      <div className="absolute top-6 right-0 z-20 w-[75%] rotate-[1deg]">
        <MusicApp />
      </div>
      <div className="absolute bottom-0 left-[10%] z-10 w-[75%] rotate-[2deg]">
        <BookApp />
      </div>
    </div>
  );
}

function StorageCard() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const example = storageExamples[selectedIdx];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {storageExamples.map((ex, i) => (
          <button
            key={ex.label}
            onClick={() => setSelectedIdx(i)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              i === selectedIdx
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {ex.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 overflow-hidden rounded-sm border">
        <div className="bg-prism overflow-auto text-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Fence
                darkMode={false}
                language="javascript"
                code={example.code}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function PermissionsCard() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const example = permissionExamples[selectedIdx];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {permissionExamples.map((ex, i) => (
          <button
            key={ex.label}
            onClick={() => setSelectedIdx(i)}
            className={cn(
              'rounded px-2.5 py-1 text-xs font-medium transition-colors',
              i === selectedIdx
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {ex.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 overflow-hidden rounded-sm border">
        <div className="bg-prism overflow-auto text-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Fence
                darkMode={false}
                language="typescript"
                code={example.code}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function Storage() {
  return (
    <LandingContainer>
      <Head>
        <title>Storage - Instant</title>
        <meta
          name="description"
          content="Digital content is just another table in your database. No separate service needed."
        />
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <div>
          <MainNav />
          <ProductNav currentSlug="storage" />

          {/* Hero */}
          <div className="py-20">
            <SectionWide>
              <div className="flex flex-col gap-10">
                <div className="flex flex-col items-center gap-8 text-center">
                  <p className="font-mono text-sm font-medium tracking-widest text-orange-600 uppercase">
                    Instant Storage
                  </p>
                  <h2 className="font-mono text-2xl leading-normal font-bold tracking-wide md:text-5xl md:leading-tight">
                    File storage and data
                    <br />
                    <span className="text-orange-600">in one place.</span>
                  </h2>
                  <p className="max-w-lg text-lg text-gray-600">
                    Digital content is just another table in your database. No
                    separate service needed.
                  </p>
                  <div className="flex gap-3">
                    <Button type="link" variant="cta" size="large" href="/dash">
                      Get started
                    </Button>
                    <Button
                      type="link"
                      variant="secondary"
                      size="large"
                      href="/docs"
                    >
                      Read the docs
                    </Button>
                  </div>
                </div>
              </div>
            </SectionWide>
          </div>

          {/* No need for a separate file storage system */}
          <div className="my-16">
            <SectionWide>
              <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
                <div className="flex flex-col gap-4 md:flex-1">
                  <h3 className="font-mono text-2xl font-bold">
                    No need for a separate file storage system
                  </h3>
                  <p className="text-gray-600">
                    Instant comes with built-in file storage. No S3 buckets to
                    configure, no signed URLs to manage.
                  </p>
                  <p className="text-gray-600">
                    When you've got storage with your database you can easily
                    build apps like Instagram, Spotify, Goodreads and more!
                  </p>
                </div>
                <div className="min-w-0 md:flex-1">
                  <AppGallery />
                </div>
              </div>
            </SectionWide>
          </div>
          {/* Files are integrated into your database */}
          <div className="mt-32 mb-16">
            <SectionWide>
              <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
                <div className="flex flex-col gap-4 md:order-2 md:flex-1">
                  <h3 className="font-mono text-2xl font-bold">
                    Files are integrated into your database
                  </h3>
                  <p className="text-gray-600">
                    Files are stored alongside other entities in Instant. Upload
                    them, link them to your data, and query with InstaQL just
                    like any other table.
                  </p>
                  <p className="text-gray-600">
                    Best of all, your files are reactive too! When a file is
                    updated or deleted, your UI updates in real-time.
                  </p>
                </div>
                <div className="min-w-0 md:order-1 md:flex-1">
                  <StorageCard />
                </div>
              </div>
            </SectionWide>
          </div>

          {/* Secure with permissions */}
          <div className="my-16">
            <SectionWide>
              <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
                <div className="flex flex-col gap-4 md:flex-1">
                  <h3 className="font-mono text-2xl font-bold">
                    Secure with permissions
                  </h3>
                  <p className="text-gray-600">
                    Files use the same permission system as the rest of your
                    data. Control who can upload, view, and delete files with
                    simple rules.
                  </p>
                  <p className="text-gray-600">
                    Your rules can traverse relationships, check auth state, and
                    enforce access at every level. No server endpoints needed.
                  </p>
                </div>
                <div className="min-w-0 md:flex-1">
                  <PermissionsCard />
                </div>
              </div>
            </SectionWide>
          </div>

          {/* CTA */}
          <div className="mt-24 mb-20">
            <SectionWide>
              <div className="text-center">
                <h3 className="font-mono text-2xl font-bold tracking-wide md:text-4xl">
                  <span className="text-orange-600">
                    Build rich applications
                  </span>
                  <br className="hidden md:block" /> with files and data
                  together.
                </h3>
                <div className="mt-10 flex justify-center gap-3">
                  <Button type="link" variant="cta" href="/dash">
                    Get started
                  </Button>
                  <Button type="link" variant="secondary" href="/docs/storage">
                    Read the docs
                  </Button>
                </div>
              </div>
            </SectionWide>
          </div>
        </div>
        <LandingFooter />
      </div>
    </LandingContainer>
  );
}

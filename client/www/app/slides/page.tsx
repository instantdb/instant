'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Slide2V2 } from './slide-2/page';
import { Slide3 } from './slide-3/page';
import { Slide4 } from './slide-4/page';
import { SlideD as Slide5 } from './slide-5/page';
import { Slide6A4 } from './slide-6/page';
import { Slide7C2 } from './slide-7/page';
import { useStarCount } from '@/lib/starCountContext';
import { instantRepo } from '@/lib/config';

function GitHubStars() {
  const starCount = useStarCount(instantRepo);
  return (
    <span className="bg-secondary-fill border-secondary-border flex -rotate-[1deg] items-center gap-2 rounded-[8px] border p-2.5 px-6 text-3xl">
      <img
        src="/img/github-icon.svg"
        alt="GitHub"
        className="h-[30px] w-[30px]"
      />
      <span className="pl-1 font-semibold">10.1K+</span>
      <span>stars</span>
    </span>
  );
}

function InstantLogo() {
  return (
    <div className="flex items-center gap-3">
      <img src="/img/icon/logo-512.svg" alt="" className="h-[32px] w-[32px]" />
      <span className="font-mono text-[38px] leading-none font-semibold tracking-tight text-black lowercase">
        instant
      </span>
    </div>
  );
}

const SLIDE_W = 1200;
const SLIDE_H = 675;
const THUMB_W = 380;
const THUMB_SCALE = THUMB_W / SLIDE_W;
const NAV_THUMB_W = 370;
const NAV_THUMB_SCALE = NAV_THUMB_W / SLIDE_W;

function SlideThumb({ children, id }: { children: ReactNode; id: string }) {
  return (
    <a
      href={`#${id}`}
      className="block shrink-0 overflow-hidden rounded-md border border-gray-300 shadow-sm transition-shadow hover:shadow-md"
      style={{
        width: NAV_THUMB_W,
        height: SLIDE_H * NAV_THUMB_SCALE,
      }}
    >
      <div
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${NAV_THUMB_SCALE})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </a>
  );
}

function SlidePreview({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-8">
      <div style={{ width: SLIDE_W, height: SLIDE_H }} className="shrink-0">
        {children}
      </div>
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: THUMB_W,
          height: SLIDE_H * THUMB_SCALE,
        }}
      >
        <div
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            transform: `scale(${THUMB_SCALE})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Slide1() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '40%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <div className="mb-10">
          <GitHubStars />
        </div>
        <h2 className="text-center text-[80px] leading-[1.2] font-normal tracking-tight">
          The best backend for
          <br />
          <span className="text-orange-600">AI-coded apps</span>
        </h2>
        <div className="mt-8 flex items-center gap-4 text-3xl text-gray-500">
          <span>Auth</span>
          <span>·</span>
          <span>Database</span>
          <span>·</span>
          <span>Permissions</span>
          <span>·</span>
          <span>Realtime</span>
          <span>·</span>
          <span>Storage</span>
        </div>
        <div className="mt-12">
          <InstantLogo />
        </div>
      </div>
    </div>
  );
}

const slides = [
  {
    id: 'slide-1',
    label: 'Slide 1',
    varPath: '/slides/slide-1',
    component: <Slide1 />,
  },
  {
    id: 'slide-2',
    label: 'Slide 2',
    varPath: '/slides/slide-2',
    component: <Slide2V2 />,
  },
  {
    id: 'slide-3',
    label: 'Slide 3',
    varPath: '/slides/slide-3',
    component: <Slide3 />,
  },
  {
    id: 'slide-4',
    label: 'Slide 4',
    varPath: '/slides/slide-4',
    component: <Slide4 />,
  },
  {
    id: 'slide-5',
    label: 'Slide 5',
    varPath: '/slides/slide-5',
    component: <Slide5 />,
  },
  {
    id: 'slide-6',
    label: 'Slide 6',
    varPath: '/slides/slide-6',
    component: <Slide6A4 />,
  },
  {
    id: 'slide-7',
    label: 'Slide 7',
    varPath: '/slides/slide-7',
    component: <Slide7C2 />,
  },
];

export default function SlidesPage() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <div className="w-full max-w-[100vw] self-stretch">
        <h1 className="mb-4 text-2xl font-medium text-gray-500">
          Instant Slides
        </h1>
        {/* Horizontal scrolling nav of thumbnails */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          {slides.map((s) => (
            <div
              key={s.id}
              className="flex shrink-0 flex-col items-center gap-1.5"
            >
              <SlideThumb id={s.id}>{s.component}</SlideThumb>
              <span className="text-xs text-gray-400">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {slides.map((s) => (
        <div key={s.id} id={s.id} className="flex scroll-mt-8 flex-col gap-3">
          <div className="flex items-baseline gap-4">
            <p className="text-sm font-medium text-gray-400">{s.label}</p>
            <Link
              href={s.varPath}
              className="text-sm text-gray-400 underline hover:text-gray-600"
            >
              Variations
            </Link>
          </div>
          <SlidePreview>{s.component}</SlidePreview>
        </div>
      ))}
    </div>
  );
}

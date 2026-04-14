'use client';

import type { ReactNode } from 'react';
import { useStarCount } from '@/lib/starCountContext';
import { formatNumberCompact } from '@/lib/format';
import { instantRepo } from '@/lib/config';

function GitHubStars({ invert }: { invert?: boolean }) {
  const starCount = useStarCount(instantRepo);
  return (
    <span
      className={`flex -rotate-[1deg] items-center gap-2 rounded-[8px] border p-2 px-5 text-2xl ${
        invert
          ? 'border-gray-700 bg-white/10'
          : 'bg-secondary-fill border-secondary-border'
      }`}
    >
      <img
        src="/img/github-icon.svg"
        alt="GitHub"
        className={`h-[26px] w-[26px] ${invert ? 'invert' : ''}`}
      />
      <span className={`pl-1 font-semibold ${invert ? 'text-white' : ''}`}>
        10.1K+
      </span>
      <span className={invert ? 'text-gray-400' : ''}>stars</span>
    </span>
  );
}

function InstantLogo({ invert }: { invert?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/img/icon/logo-512.svg"
        alt=""
        className={`h-[32px] w-[32px] ${invert ? 'invert' : ''}`}
      />
      <span
        className={`font-mono text-[38px] leading-none font-semibold tracking-tight lowercase ${invert ? 'text-white' : 'text-black'}`}
      >
        instant
      </span>
    </div>
  );
}

const SLIDE_W = 1200;
const SLIDE_H = 675;
const THUMB_W = 380;
const THUMB_SCALE = THUMB_W / SLIDE_W;

function SlidePreview({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-8">
      {/* Full size */}
      <div style={{ width: SLIDE_W, height: SLIDE_H }} className="shrink-0">
        {children}
      </div>
      {/* Zoomed-out thumbnail */}
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

function SlideAContent() {
  return (
    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
      {/* GitHub stars badge */}
      <div className="mb-10">
        <GitHubStars />
      </div>

      {/* Headline */}
      <h2 className="text-center text-[80px] leading-[1.1] font-normal tracking-tight">
        The best backend for
        <br />
        <span className="text-orange-600">AI-coded apps</span>
      </h2>

      {/* Subtitle tags */}
      <div className="mt-8 flex items-center gap-4 text-2xl text-gray-500">
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

      {/* Logo */}
      <div className="mt-12">
        <InstantLogo />
      </div>
    </div>
  );
}

{
  /* A1: Soft horizontal band — orange wash across the middle, cream edges */
}
function SlideA1() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, #FBF9F6 0%, rgba(242,150,80,0.18) 35%, rgba(242,150,80,0.18) 65%, #FBF9F6 100%)',
        }}
      />
      <SlideAContent />
    </div>
  );
}

{
  /* A2: Top glow — warm orange fading down from the top like the homepage hero */
}
function SlideA2() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(242,150,80,0.22) 0%, rgba(242,150,80,0.08) 50%, #FBF9F6 100%)',
        }}
      />
      <SlideAContent />
    </div>
  );
}

{
  /* A3: Radial spotlight — soft orange bloom behind the headline area */
}
function SlideA3() {
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
      <SlideAContent />
    </div>
  );
}

function SlideB() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#0A0A0A]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Orange glow from bottom center */}
      <div
        className="pointer-events-none absolute"
        style={{
          bottom: '-10%',
          left: '50%',
          width: 1000,
          height: 600,
          transform: 'translateX(-50%)',
          background:
            'radial-gradient(ellipse at center bottom, rgba(234,88,12,0.35) 0%, rgba(234,88,12,0.12) 35%, transparent 65%)',
        }}
      />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        {/* Logo */}
        <div className="mb-10">
          <InstantLogo invert />
        </div>

        {/* Headline */}
        <h2 className="text-center text-[80px] leading-[1.1] font-normal tracking-tight text-white">
          The best backend for
          <br />
          <span className="text-orange-500">AI-coded apps</span>
        </h2>

        {/* Star count */}
        <div className="mt-10 flex items-center gap-4 text-gray-400">
          <GitHubStars invert />
          <span className="text-lg">Backed by Y Combinator</span>
        </div>
      </div>
    </div>
  );
}

function SlideC() {
  return (
    <div
      className="relative flex overflow-hidden bg-linear-to-b from-[#FBF9F6] via-[#f2965030] to-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Content — left-aligned */}
      <div className="relative z-10 flex h-full w-full flex-col justify-center px-20">
        {/* Logo */}
        <div className="mb-8">
          <InstantLogo />
        </div>

        {/* Headline */}
        <h2 className="text-[80px] leading-[1.1] font-normal tracking-tight">
          The best backend
          <br />
          for <span className="text-orange-600">AI-coded</span> apps
        </h2>

        {/* Bottom row: stars + features */}
        <div className="mt-10 flex items-center gap-6">
          <GitHubStars />
          <div className="flex items-center gap-4 text-xl text-gray-500">
            <span>Auth</span>
            <span>·</span>
            <span>Database</span>
            <span>·</span>
            <span>Permissions</span>
            <span>·</span>
            <span>Realtime</span>
          </div>
        </div>
      </div>

      {/* Decorative — right side code-like element */}
      <div className="absolute top-1/2 right-16 -translate-y-1/2 font-mono text-[13px] leading-relaxed text-gray-200 select-none">
        <pre>{`const db = init({
  appId: "my-app"
});

db.useQuery({
  posts: {
    comments: {}
  }
});`}</pre>
      </div>
    </div>
  );
}

export default function Slide1Page() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <h1 className="text-2xl font-medium text-gray-500">
        Slide 1 — 3 Variations
      </h1>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          A1 — Horizontal band
        </p>
        <SlidePreview>
          <SlideA1 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">A2 — Top glow</p>
        <SlidePreview>
          <SlideA2 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          A3 — Radial spotlight
        </p>
        <SlidePreview>
          <SlideA3 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">Variation B</p>
        <SlidePreview>
          <SlideB />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">Variation C</p>
        <SlidePreview>
          <SlideC />
        </SlidePreview>
      </div>
    </div>
  );
}

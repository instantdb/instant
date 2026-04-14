'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';

const SLIDE_W = 1200;
const SLIDE_H = 675;
const THUMB_W = 380;
const THUMB_SCALE = THUMB_W / SLIDE_W;

const backers = [
  {
    name: 'Greg Brockman',
    role: 'Co-Founder of OpenAI',
    imageSrc: '/img/investors/greg-brockman.jpg',
  },
  {
    name: 'Jeff Dean',
    role: 'Chief Scientist of Google DeepMind',
    imageSrc: '/img/investors/jeff-dean.jpg',
  },
  {
    name: 'Paul Graham',
    role: 'Co-Founder of YCombinator',
    imageSrc: '/img/investors/paul-graham.jpg',
  },
  {
    name: 'Amjad Masad',
    role: 'CEO of Replit',
    imageSrc: '/img/investors/amjad-masad.jpg',
  },
  {
    name: 'Karri Saarinen',
    role: 'CEO of Linear',
    imageSrc: '/img/investors/karri-saarinen.jpg',
  },
  {
    name: 'Zach Sims',
    role: 'CEO of Codecademy',
    imageSrc: '/img/investors/zach-sims.jpg',
  },
];

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

function Stats({ light }: { light?: boolean }) {
  const stats = [
    {
      key: 'connections',
      value: '15K+',
      label: 'concurrent connections',
    },
    {
      key: 'queries',
      value: '1,000+',
      label: 'queries per second',
    },
    {
      key: 'stars',
      value: '10.1K+',
      label: 'github stars',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-8">
      {stats.map((stat) => (
        <div key={stat.key} className="text-center">
          <div
            className={`font-mono text-5xl font-semibold tracking-tighter ${light ? 'text-white' : ''}`}
          >
            {stat.value}
          </div>
          <div
            className={`mt-2 font-mono text-sm ${light ? 'text-white/70' : 'text-gray-500'}`}
          >
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function Backers({ size = 'normal' }: { size?: 'normal' | 'small' }) {
  const imgSize = size === 'small' ? 'h-14 w-14' : 'h-16 w-16';
  const gap = size === 'small' ? 'gap-x-6 gap-y-4' : 'gap-x-10 gap-y-6';
  return (
    <div className={`flex flex-wrap justify-center ${gap}`}>
      {backers.map((backer) => (
        <div key={backer.name} className="w-28 text-center">
          <Image
            src={backer.imageSrc}
            alt={backer.name}
            width={80}
            height={80}
            className={`mx-auto ${imgSize} rounded-full object-cover object-center`}
          />
          <div className="mt-2">
            <div className="text-xs font-semibold">{backer.name}</div>
            <div className="text-[10px] text-gray-500">{backer.role}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function YCIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect width="24" height="24" rx="4" fill="#F26522" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fill="white"
        fontSize="14"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        Y
      </text>
    </svg>
  );
}

function SVAngelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#1a1a1a" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fill="white"
        fontSize="10"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        SVA
      </text>
    </svg>
  );
}

function TechCrunchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#0A9E01" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        TC
      </text>
    </svg>
  );
}

function CredibilityBadges() {
  return (
    <div className="flex items-center justify-center gap-x-6 text-sm text-gray-400">
      <div className="flex items-center gap-1.5">
        <YCIcon className="h-4 w-4" />
        <span>Backed by Y Combinator</span>
      </div>
      <span className="text-gray-300">·</span>
      <div className="flex items-center gap-1.5">
        <SVAngelIcon className="h-4 w-4" />
        <span>Backed by SV Angel</span>
      </div>
      <span className="text-gray-300">·</span>
      <div className="flex items-center gap-1.5">
        <TechCrunchIcon className="h-3.5 w-3.5" />
        <span>Featured in TechCrunch</span>
      </div>
    </div>
  );
}

{
  /* --- Variation A: Stats + Backers, radial spotlight --- */
}
export function Slide6A() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '35%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <h2 className="text-center text-[52px] leading-[1.15] font-normal tracking-tight">
          Trusted by developers
        </h2>

        <div className="mt-10">
          <Stats />
        </div>

        <div className="mt-8">
          <CredibilityBadges />
        </div>

        <div className="mt-10">
          <p className="mb-5 text-center text-lg font-normal">
            Backed by the best
          </p>
          <Backers />
          <p className="mt-4 text-center text-xs text-gray-500">
            And 50+ technical founders from Sendbird, Panther, Segment, and more
          </p>
        </div>
      </div>
    </div>
  );
}

{
  /* --- Variation A2: Radial spotlight bg, stats + Tamplin quote + backers (E layout) --- */
}
export function Slide6A2() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '35%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-14">
        <h2 className="text-center text-[44px] leading-[1.15] font-normal tracking-tight">
          Trusted by developers
        </h2>

        <div className="mt-6">
          <Stats />
        </div>

        {/* Quote */}
        <div className="mt-6 max-w-[700px]">
          <p className="mb-3 text-center text-2xl tracking-tight">
            From the founder of Firebase
          </p>
          <blockquote className="rounded-xl border border-gray-200 bg-white/70 px-6 py-5 text-center text-[15px] leading-relaxed text-gray-500 italic">
            &ldquo;The amount of requests we had for relational queries for
            Firebase was off-the-charts. I always wanted this built and open
            sourced. I&#39;m glad to see Instant is doing it!&rdquo;
          </blockquote>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Image
              src="/img/investors/james-tamplin.jpg"
              alt="James Tamplin"
              width={160}
              height={160}
              className="h-8 w-8 shrink-0 rounded-full object-cover object-center"
            />
            <div className="text-sm text-gray-500">James Tamplin</div>
          </div>
        </div>

        {/* Compact backers */}
        <div className="mt-5 flex items-center gap-2.5">
          {backers.map((backer) => (
            <Image
              key={backer.name}
              src={backer.imageSrc}
              alt={backer.name}
              width={80}
              height={80}
              className="h-10 w-10 rounded-full object-cover object-center"
            />
          ))}
          <svg
            className="h-10 w-10 shrink-0 rounded-full"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <rect width="24" height="24" rx="12" fill="#F26522" />
            <text
              x="12"
              y="17"
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight="bold"
              fontFamily="sans-serif"
            >
              Y
            </text>
          </svg>
          <svg
            className="h-10 w-10 shrink-0 rounded-full"
            viewBox="0 0 24 24"
            fill="none"
          >
            <rect width="24" height="24" rx="12" fill="#1a1a1a" />
            <text
              x="12"
              y="17"
              textAnchor="middle"
              fill="white"
              fontSize="10"
              fontWeight="bold"
              fontFamily="sans-serif"
            >
              SVA
            </text>
          </svg>
          <span className="ml-2 text-xs text-gray-500">
            and 50+ more founders
          </span>
        </div>
      </div>
    </div>
  );
}

{
  /* --- Variation A3: Two-column — stats left, quote+backers right --- */
}
export function Slide6A3() {
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
      <div className="relative z-10 flex h-full w-full items-center gap-10 px-14">
        {/* Left: title + stats */}
        <div className="flex flex-1 flex-col">
          <h2 className="text-[48px] leading-[1.1] font-normal tracking-tight">
            Trusted by
            <br />
            developers
          </h2>
          <div className="mt-8">
            <Stats />
          </div>
        </div>

        {/* Right: quote + backers */}
        <div className="flex w-[500px] shrink-0 flex-col">
          <p className="text-2xl tracking-tight">
            From the founder of Firebase
          </p>
          <blockquote className="mt-3 rounded-xl border border-gray-200 bg-white/70 px-5 py-4 text-[15px] leading-relaxed text-gray-500 italic">
            &ldquo;The amount of requests we had for relational queries for
            Firebase was off-the-charts. I always wanted this built and open
            sourced. I&#39;m glad to see Instant is doing it!&rdquo;
          </blockquote>
          <div className="mt-2 flex items-center gap-2">
            <Image
              src="/img/investors/james-tamplin.jpg"
              alt="James Tamplin"
              width={160}
              height={160}
              className="h-7 w-7 shrink-0 rounded-full object-cover object-center"
            />
            <span className="text-sm text-gray-500">James Tamplin</span>
          </div>

          <p className="mt-6 text-lg font-medium">Backed by the best</p>
          <div className="mt-3 flex items-center gap-2">
            {backers.map((backer) => (
              <Image
                key={backer.name}
                src={backer.imageSrc}
                alt={backer.name}
                width={80}
                height={80}
                className="h-10 w-10 rounded-full object-cover object-center"
              />
            ))}
            <svg
              className="h-10 w-10 shrink-0 rounded-full"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <rect width="24" height="24" rx="12" fill="#F26522" />
              <text
                x="12"
                y="17"
                textAnchor="middle"
                fill="white"
                fontSize="14"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                Y
              </text>
            </svg>
            <svg
              className="h-10 w-10 shrink-0 rounded-full"
              viewBox="0 0 24 24"
              fill="none"
            >
              <rect width="24" height="24" rx="12" fill="#1a1a1a" />
              <text
                x="12"
                y="17"
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                SVA
              </text>
            </svg>
          </div>
          <span className="mt-2 text-xs text-gray-500">
            and 50+ more founders
          </span>
        </div>
      </div>
    </div>
  );
}

{
  /* --- Variation A4: Stacked — title, stats row, then quote and backers side by side --- */
}
export function Slide6A4() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '35%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-14">
        <h2 className="text-center text-[44px] leading-[1.15] font-normal tracking-tight">
          Trusted by developers
        </h2>

        <div className="mt-8">
          <Stats />
        </div>

        {/* Bottom half: quote left, backers right */}
        <div className="mt-12 flex w-full items-start gap-12">
          {/* Quote */}
          <div className="flex-1">
            <p className="text-2xl tracking-tight">
              <span className="text-gray-400">From the</span> Founder of
              Firebase
            </p>
            <blockquote className="mt-4 text-lg leading-relaxed text-balance text-gray-500">
              The amount of requests we had for relational queries for Firebase
              was off-the-charts. I always wanted this built and open sourced.
              I&#39;m glad to see Instant is doing it!
            </blockquote>
            <div className="mt-4 flex items-center gap-3">
              <Image
                src="/img/investors/james-tamplin.jpg"
                alt="James Tamplin"
                width={160}
                height={160}
                className="h-10 w-10 shrink-0 rounded-full object-cover object-center"
              />
              <div>
                <div className="text-sm font-semibold">James Tamplin</div>
                <div className="text-xs text-gray-500">Founder of Firebase</div>
              </div>
            </div>
          </div>

          {/* Backers */}
          <div className="w-[420px] shrink-0">
            <p className="text-2xl tracking-tight">Backed by the best</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {backers.map((backer) => (
                <div key={backer.name} className="w-[72px] text-center">
                  <Image
                    src={backer.imageSrc}
                    alt={backer.name}
                    width={80}
                    height={80}
                    className="mx-auto h-16 w-16 rounded-full object-cover object-center"
                  />
                  <div className="mt-1 text-[9px] leading-tight font-medium">
                    {backer.name}
                  </div>
                </div>
              ))}
              <div className="w-[72px] text-center">
                <svg
                  className="mx-auto h-16 w-16 rounded-full"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect width="24" height="24" rx="12" fill="#F26522" />
                  <text
                    x="12"
                    y="17"
                    textAnchor="middle"
                    fill="white"
                    fontSize="14"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    Y
                  </text>
                </svg>
                <div className="mt-1 text-[9px] leading-tight font-medium">
                  Y Combinator
                </div>
              </div>
              <div className="w-[72px] text-center">
                <svg
                  className="mx-auto h-16 w-16 rounded-full"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <rect width="24" height="24" rx="12" fill="#1a1a1a" />
                  <text
                    x="12"
                    y="17"
                    textAnchor="middle"
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    SVA
                  </text>
                </svg>
                <div className="mt-1 text-[9px] leading-tight font-medium">
                  SV Angel
                </div>
              </div>
              <span className="text-xs text-gray-500">+50 more founders</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

{
  /* --- Variation B: Stats top, quote from James Tamplin, backers bottom --- */
}
export function Slide6B() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '35%',
          left: '50%',
          width: 1100,
          height: 500,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(ellipse at center, rgba(242,150,80,0.2) 0%, rgba(242,150,80,0.06) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center px-16 pt-12">
        <h2 className="text-center text-[48px] leading-[1.15] font-normal tracking-tight">
          Trusted by developers
        </h2>

        <div className="mt-8">
          <Stats />
        </div>

        {/* James Tamplin quote */}
        <div className="mt-8 flex max-w-[750px] items-start gap-5 rounded-xl border border-gray-200 bg-white/70 px-6 py-5">
          <Image
            src="/img/investors/james-tamplin.jpg"
            alt="James Tamplin"
            width={160}
            height={160}
            className="h-14 w-14 shrink-0 rounded-full object-cover object-center"
          />
          <div>
            <blockquote className="text-sm leading-relaxed text-gray-500">
              The amount of requests we had for relational queries for Firebase
              was off-the-charts. I always wanted this built and open sourced.
              I&#39;m glad to see Instant is doing it!
            </blockquote>
            <div className="mt-2">
              <span className="text-xs font-semibold">James Tamplin</span>
              <span className="text-xs text-gray-500">
                {' '}
                · Founder of Firebase
              </span>
            </div>
          </div>
        </div>

        {/* Compact backers row */}
        <div className="mt-6 flex items-center gap-3">
          {backers.map((backer) => (
            <div key={backer.name} className="group relative">
              <Image
                src={backer.imageSrc}
                alt={backer.name}
                width={80}
                height={80}
                className="h-11 w-11 rounded-full object-cover object-center"
              />
            </div>
          ))}
          <span className="ml-2 text-xs text-gray-500">
            and 50+ more founders
          </span>
        </div>
      </div>
    </div>
  );
}

{
  /* --- Variation C: Two-column — stats+backers left, Tamplin quote right --- */
}
export function Slide6C() {
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
      <div className="relative z-10 flex h-full w-full items-center gap-12 px-16">
        {/* Left column */}
        <div className="flex flex-1 flex-col">
          <h2 className="text-[48px] leading-[1.15] font-normal tracking-tight">
            Trusted by
            <br />
            developers
          </h2>

          <div className="mt-8">
            <Stats />
          </div>

          <div className="mt-6">
            <CredibilityBadges />
          </div>
        </div>

        {/* Right column — quote + backers */}
        <div className="flex w-[460px] shrink-0 flex-col items-center">
          {/* Quote card */}
          <div className="rounded-xl border border-gray-200 bg-white/70 px-6 py-5">
            <blockquote className="text-sm leading-relaxed text-gray-500">
              The amount of requests we had for relational queries for Firebase
              was off-the-charts. I always wanted this built and open sourced.
              I&#39;m glad to see Instant is doing it!
            </blockquote>
            <div className="mt-3 flex items-center gap-3">
              <Image
                src="/img/investors/james-tamplin.jpg"
                alt="James Tamplin"
                width={160}
                height={160}
                className="h-10 w-10 rounded-full object-cover object-center"
              />
              <div>
                <div className="text-xs font-semibold">James Tamplin</div>
                <div className="text-[10px] text-gray-500">
                  Founder of Firebase
                </div>
              </div>
            </div>
          </div>

          {/* Backers */}
          <div className="mt-6">
            <p className="mb-3 text-center text-sm font-normal text-gray-500">
              Backed by the best
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {backers.map((backer) => (
                <Image
                  key={backer.name}
                  src={backer.imageSrc}
                  alt={backer.name}
                  width={80}
                  height={80}
                  className="h-12 w-12 rounded-full object-cover object-center"
                />
              ))}
            </div>
            <p className="mt-3 text-center text-[10px] text-gray-500">
              And 50+ technical founders from Sendbird, Panther, Segment, and
              more
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

{
  /* --- Variation D: Orange bg, white content card inset --- */
}
export function Slide6D() {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden bg-orange-600"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* White card inset */}
      <div className="mx-10 my-8 flex h-[calc(100%-64px)] w-[calc(100%-80px)] flex-col items-center justify-center rounded-2xl bg-white px-16 shadow-2xl">
        <h2 className="text-center text-[48px] leading-[1.15] font-normal tracking-tight">
          Trusted by developers
        </h2>

        <div className="mt-8">
          <Stats />
        </div>

        <div className="mt-6">
          <CredibilityBadges />
        </div>

        <div className="mt-8">
          <Backers size="small" />
          <p className="mt-3 text-center text-xs text-gray-500">
            And 50+ technical founders from Sendbird, Panther, Segment, and more
          </p>
        </div>
      </div>
    </div>
  );
}

{
  /* --- Variation E: Orange bg, white card with Tamplin quote --- */
}
export function Slide6E() {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden bg-orange-600"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      <div className="mx-10 my-8 flex h-[calc(100%-64px)] w-[calc(100%-80px)] flex-col items-center justify-center rounded-2xl bg-white px-14 shadow-2xl">
        <h2 className="text-center text-[44px] leading-[1.15] font-normal tracking-tight">
          Trusted by developers
        </h2>

        <div className="mt-6">
          <Stats />
        </div>

        {/* Quote */}
        <div className="mt-6 flex max-w-[700px] items-start gap-4 rounded-xl border border-gray-100 bg-gray-50 px-5 py-4">
          <Image
            src="/img/investors/james-tamplin.jpg"
            alt="James Tamplin"
            width={160}
            height={160}
            className="h-12 w-12 shrink-0 rounded-full object-cover object-center"
          />
          <div>
            <blockquote className="text-sm leading-relaxed text-gray-500">
              The amount of requests we had for relational queries for Firebase
              was off-the-charts. I always wanted this built and open sourced.
              I&#39;m glad to see Instant is doing it!
            </blockquote>
            <div className="mt-2">
              <span className="text-xs font-semibold">James Tamplin</span>
              <span className="text-xs text-gray-500">
                {' '}
                · Founder of Firebase
              </span>
            </div>
          </div>
        </div>

        {/* Compact backers */}
        <div className="mt-5 flex items-center gap-2.5">
          {backers.map((backer) => (
            <Image
              key={backer.name}
              src={backer.imageSrc}
              alt={backer.name}
              width={80}
              height={80}
              className="h-10 w-10 rounded-full object-cover object-center"
            />
          ))}
          <span className="ml-2 text-xs text-gray-500">
            and 50+ more founders
          </span>
        </div>
      </div>
    </div>
  );
}

{
  /* --- Variation F: Orange top half, cream bottom with stats spanning --- */
}
export function Slide6F() {
  return (
    <div
      className="relative flex overflow-hidden"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Orange top */}
      <div className="absolute inset-x-0 top-0 h-[280px] bg-orange-600" />
      {/* Cream bottom */}
      <div className="absolute inset-x-0 bottom-0 h-[395px] bg-[#FBF9F6]" />

      <div className="relative z-10 flex h-full w-full flex-col items-center px-16 pt-10">
        <h2 className="text-center text-[48px] leading-[1.15] font-normal tracking-tight text-white">
          Trusted by developers
        </h2>

        {/* Stats card spanning the boundary */}
        <div className="mt-8 rounded-2xl bg-white px-16 py-8 shadow-xl">
          <Stats />
        </div>

        <div className="mt-6">
          <CredibilityBadges />
        </div>

        {/* Backers */}
        <div className="mt-6 flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            {backers.map((backer) => (
              <Image
                key={backer.name}
                src={backer.imageSrc}
                alt={backer.name}
                width={80}
                height={80}
                className="h-12 w-12 rounded-full border-2 border-white object-cover object-center shadow-sm"
              />
            ))}
          </div>
          <div className="text-sm text-gray-500">
            <span className="font-semibold">Backed by the best</span>
            <br />
            <span className="text-xs">
              Greg Brockman, Jeff Dean, Paul Graham, and 50+ more
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Slide6Page() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <h1 className="text-2xl font-medium text-gray-500">
        Slide 6 — Variations
      </h1>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">A — Stats + Backers</p>
        <SlidePreview>
          <Slide6A />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          A2 — Radial spotlight + Tamplin quote + Backers
        </p>
        <SlidePreview>
          <Slide6A2 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          A3 — Two-column: stats left, quote + backers right
        </p>
        <SlidePreview>
          <Slide6A3 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          A4 — Stats top, quote + backers side by side
        </p>
        <SlidePreview>
          <Slide6A4 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          B — Stats + Tamplin quote + Backers
        </p>
        <SlidePreview>
          <Slide6B />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          C — Two-column with quote
        </p>
        <SlidePreview>
          <Slide6C />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          D — Orange bg, white card inset
        </p>
        <SlidePreview>
          <Slide6D />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          E — Orange bg, white card + Tamplin quote
        </p>
        <SlidePreview>
          <Slide6E />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          F — Orange/cream split with stats bridge
        </p>
        <SlidePreview>
          <Slide6F />
        </SlidePreview>
      </div>
    </div>
  );
}

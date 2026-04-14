'use client';

import type { ReactNode } from 'react';
import { rosePineDawnColors as c } from '@/lib/rosePineDawnTheme';

const SLIDE_W = 1200;
const SLIDE_H = 675;
const THUMB_W = 380;
const THUMB_SCALE = THUMB_W / SLIDE_W;

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

function TerminalBlock() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-gray-200 shadow-2xl"
      style={{ backgroundColor: c.bg }}
    >
      {/* Title bar */}
      <div className="relative flex items-center gap-2 border-b border-gray-200 px-4 py-3">
        <div className="h-3 w-3 rounded-full bg-[#ed6a5e]" />
        <div className="h-3 w-3 rounded-full bg-[#f5bf4f]" />
        <div className="h-3 w-3 rounded-full bg-[#62c554]" />
        <span
          className="absolute inset-x-0 flex items-center justify-center gap-1.5 text-sm"
          style={{ color: c.punctuation }}
        >
          <img src="/img/ghostty-icon.png" alt="" className="h-4 w-4" />
          Terminal
        </span>
      </div>

      {/* Terminal content */}
      <div className="p-6 font-mono text-[22px] leading-relaxed">
        <div className="flex items-center gap-2">
          <span style={{ color: c.string }}>$</span>
          <span style={{ color: c.text }}>npx create-instant-app</span>
        </div>
        <div className="mt-4 space-y-1">
          <div>
            <span style={{ color: c.punctuation }}>? </span>
            <span style={{ color: c.text }}>App name: </span>
            <span style={{ color: c.tag }}>my-app</span>
          </div>
          <div>
            <span style={{ color: c.punctuation }}>? </span>
            <span style={{ color: c.text }}>Template: </span>
            <span style={{ color: c.tag }}>react-next</span>
          </div>
        </div>
        <div className="mt-4 space-y-1">
          <div>
            <span style={{ color: '#62c554' }}>✓</span>
            <span className="ml-2" style={{ color: c.text }}>
              Created app
            </span>
          </div>
          <div>
            <span style={{ color: '#62c554' }}>✓</span>
            <span className="ml-2" style={{ color: c.text }}>
              Pushed schema
            </span>
          </div>
          <div>
            <span style={{ color: '#62c554' }}>✓</span>
            <span className="ml-2" style={{ color: c.text }}>
              Auth, database, permissions, storage ready
            </span>
          </div>
        </div>
        <div className="mt-4">
          <span style={{ color: c.keyword }}>→</span>
          <span className="ml-2" style={{ color: c.text }}>
            cd my-app && npm run dev
          </span>
        </div>
      </div>
    </div>
  );
}

function CommandPill() {
  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-100 px-8 py-5 font-mono text-3xl">
      <span className="text-orange-600">$</span>
      <span className="text-gray-700">npx create-instant-app</span>
    </div>
  );
}

{
  /* Variation A: Terminal hero — big terminal mockup front and center,
    headline above, subline below. Shows the full create flow. */
}
export function Slide8A() {
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
        <h2 className="text-center text-[72px] leading-[1.15] font-normal tracking-tight">
          Full-stack app in <span className="text-orange-600">5 minutes</span>
        </h2>
        <p className="mt-4 text-center text-2xl text-gray-500">
          Give your agent everything it needs with one command
        </p>
        <div className="mt-10" style={{ transform: 'rotate(1deg)' }}>
          <TerminalBlock />
        </div>
      </div>
    </div>
  );
}

{
  /* Variation B: Command-forward — the npx command is the visual centerpiece,
    massive and bold, with the headline and subline framing it. */
}
export function Slide8B() {
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
        <h2 className="text-center text-[72px] leading-[1.15] font-normal tracking-tight">
          Full-stack app in <span className="text-orange-600">5 minutes</span>
        </h2>
        <p className="mt-4 text-center text-2xl text-gray-500">
          Give your agent everything it needs with one command
        </p>

        <div className="mt-12">
          <CommandPill />
        </div>

        {/* What you get — feature pills below */}
        <div className="mt-8 flex items-center gap-3">
          {['Auth', 'Database', 'Permissions', 'Realtime', 'Storage'].map(
            (f) => (
              <span
                key={f}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-lg text-gray-500"
              >
                {f}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

{
  /* Variation C: Split — left side has headline + command,
    right side shows the terminal output. Editorial, asymmetric. */
}
export function Slide8C() {
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

      <div className="relative z-10 flex h-full w-full items-center px-16">
        {/* Left — text */}
        <div className="flex w-[480px] shrink-0 flex-col">
          <h2 className="text-[56px] leading-[1.15] font-normal tracking-tight">
            Full-stack app
            <br />
            in <span className="text-orange-600">5 minutes</span>
          </h2>
          <p className="mt-5 max-w-[400px] text-xl text-gray-500">
            Give your agent everything it needs with one command
          </p>
          <div className="mt-8 inline-flex items-center gap-3 self-start rounded-lg border border-gray-200 bg-gray-100 px-5 py-3 font-mono text-xl">
            <span className="text-orange-600">$</span>
            <span className="text-gray-700">npx create-instant-app</span>
          </div>
        </div>

        {/* Right — terminal */}
        <div
          className="ml-auto"
          style={{ transform: 'rotate(2deg)', width: 580 }}
        >
          <TerminalBlock />
        </div>
      </div>
    </div>
  );
}

{
  /* Variation D: "Ship something delightful" — big emotional headline,
    subtitle about speed, then the command as the CTA centerpiece. */
}
export function Slide8D() {
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
        <h2 className="text-center text-[80px] leading-[1.2] font-normal tracking-tight">
          Ship something <span className="text-orange-600">delightful</span>
        </h2>
        <p className="mt-5 text-center text-3xl text-gray-500">
          Give your agent everything it needs with one command
        </p>

        <div
          className="mt-14 rounded-xl border border-gray-200 px-10 py-6 font-mono text-[60px] font-bold tracking-tight"
          style={{ backgroundColor: '#faf8f5', color: '#575279' }}
        >
          npx create-instant-app
        </div>
      </div>
    </div>
  );
}

{
  /* D2: Dot grid background */
}
export function Slide8D2() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'radial-gradient(circle, #9a8c7a 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {/* Orange glow */}
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
        <h2 className="text-center text-[80px] leading-[1.2] font-normal tracking-tight">
          Ship something <span className="text-orange-600">delightful</span>
        </h2>
        <p className="mt-5 text-center text-3xl text-gray-500">
          Give your agent everything it needs with one command
        </p>
        <div
          className="mt-14 rounded-xl border border-gray-200 px-10 py-6 font-mono text-[60px] font-bold tracking-tight shadow-sm"
          style={{ backgroundColor: '#faf8f5', color: '#575279' }}
        >
          npx create-instant-app
        </div>
      </div>
    </div>
  );
}

{
  /* D3: Fine horizontal pinstripes */
}
export function Slide8D3() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Pinstripes */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #9a8c7a, #9a8c7a 1px, transparent 1px, transparent 20px)',
        }}
      />
      {/* Orange glow */}
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
        <h2 className="text-center text-[80px] leading-[1.2] font-normal tracking-tight">
          Ship something <span className="text-orange-600">delightful</span>
        </h2>
        <p className="mt-5 text-center text-3xl text-gray-500">
          Give your agent everything it needs with one command
        </p>
        <div
          className="mt-14 rounded-xl border border-gray-200 px-10 py-6 font-mono text-[60px] font-bold tracking-tight shadow-sm"
          style={{ backgroundColor: '#faf8f5', color: '#575279' }}
        >
          npx create-instant-app
        </div>
      </div>
    </div>
  );
}

{
  /* D4: Cross-hatch grid — subtle graph paper feel */
}
export function Slide8D4() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Cross-hatch grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(#9a8c7a 1px, transparent 1px), linear-gradient(90deg, #9a8c7a 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      {/* Orange glow */}
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
        <h2 className="text-center text-[80px] leading-[1.2] font-normal tracking-tight">
          Ship something <span className="text-orange-600">delightful</span>
        </h2>
        <p className="mt-5 text-center text-3xl text-gray-500">
          Give your agent everything it needs with one command
        </p>
        <p className="mt-14 font-mono text-[72px] font-normal tracking-tight text-black">
          npx create-instant-app
        </p>
      </div>
    </div>
  );
}

{
  /* Variation E: Dark — black bg, headline in white, command huge and raw */
}
export function Slide8E() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#0A0A0A]"
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
            'radial-gradient(ellipse at center, rgba(234,88,12,0.15) 0%, rgba(234,88,12,0.04) 50%, transparent 80%)',
        }}
      />

      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <h2 className="text-center text-[72px] leading-[1.2] font-normal tracking-tight text-white">
          Build something <span className="text-orange-500">delightful</span>
        </h2>

        <p className="mt-5 text-center text-3xl text-gray-400">
          Give your agent everything it needs with one command
        </p>

        <p className="mt-14 font-mono text-[52px] font-medium tracking-tight text-orange-500">
          npx create-instant-app
        </p>
      </div>
    </div>
  );
}

export default function Slide8Page() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <h1 className="text-2xl font-medium text-gray-500">
        Slide 8 — 3 Variations
      </h1>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">A — Terminal hero</p>
        <SlidePreview>
          <Slide8A />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">B — Command forward</p>
        <SlidePreview>
          <Slide8B />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">C — Split layout</p>
        <SlidePreview>
          <Slide8C />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          D — Ship something delightful
        </p>
        <SlidePreview>
          <Slide8D />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">D2 — Dot grid</p>
        <SlidePreview>
          <Slide8D2 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">D3 — Pinstripes</p>
        <SlidePreview>
          <Slide8D3 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">
          D4 — Cross-hatch grid
        </p>
        <SlidePreview>
          <Slide8D4 />
        </SlidePreview>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-gray-400">E — Dark</p>
        <SlidePreview>
          <Slide8E />
        </SlidePreview>
      </div>
    </div>
  );
}

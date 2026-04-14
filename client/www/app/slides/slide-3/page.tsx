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

function TerminalMockup() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-gray-200 shadow-2xl"
      style={{ backgroundColor: c.bg, width: 900 }}
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
      <div className="p-6 font-mono text-[25px] leading-relaxed">
        {/* Command line */}
        <div className="flex items-center gap-2">
          <span style={{ color: c.keyword }}>$</span>
          <span style={{ color: c.text }}>npx instant-cli push schema</span>
        </div>

        {/* Schema diff box */}
        <div
          className="mt-6 border px-4 py-3"
          style={{ borderColor: `${c.punctuation}40` }}
        >
          <div>
            <span
              className="px-2 py-px text-white"
              style={{ backgroundColor: c.keyword }}
            >
              + CREATE NAMESPACE
            </span>
            <span className="ml-2" style={{ color: c.text }}>
              todos
            </span>
          </div>
          <div className="mt-1 space-y-0.5 pl-3">
            <div style={{ color: c.keyword }}>+ CREATE ATTR todos.id</div>
            <div style={{ color: c.keyword }}>+ CREATE ATTR todos.text</div>
            <div className="pl-6" style={{ color: c.punctuation }}>
              DATA TYPE: string
            </div>
          </div>
        </div>

        {/* Push prompt */}
        <div className="mt-6">
          <div style={{ color: c.text }}>Push these changes?</div>
          <div className="mt-4 flex gap-4">
            <span
              className="px-4 py-1 text-white"
              style={{ backgroundColor: c.string }}
            >
              Push
            </span>
            <span
              className="border px-4 py-1"
              style={{
                borderColor: `${c.punctuation}60`,
                color: c.punctuation,
              }}
            >
              Cancel
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Slide3() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Radial spotlight glow */}
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

      {/* Content */}
      <div className="relative z-10 flex h-full w-full px-16 pt-12">
        {/* Title — left */}
        <h2 className="text-[52px] leading-[1.15] font-normal tracking-tight">
          What <span className="text-orange-600">you</span> can do,
          <br />
          your <span className="text-orange-600">agent</span> can do
        </h2>

        {/* Subtitle — right */}
        <p className="ml-auto max-w-[420px] pt-3 text-2xl text-gray-500">
          A backend designed for the CLI. No dashboards needed and schema undo
          comes built in.
        </p>

        {/* Terminal — blown up, centered, rotated */}
        <div
          className="absolute"
          style={{
            bottom: -20,
            left: '50%',
            transform: 'translateX(-50%) rotate(2deg)',
          }}
        >
          <TerminalMockup />
        </div>
      </div>
    </div>
  );
}

export default function Slide3Page() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <h1 className="text-2xl font-medium text-gray-500">Slide 3</h1>

      <div className="flex flex-col gap-3">
        <SlidePreview>
          <Slide3 />
        </SlidePreview>
      </div>
    </div>
  );
}

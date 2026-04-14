'use client';

import type { ReactNode } from 'react';

const SLIDE_W = 1200;
const SLIDE_H = 675;
const THUMB_W = 380;
const THUMB_SCALE = THUMB_W / SLIDE_W;

function SlidePreview({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-gray-400">{label}</p>
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
    </div>
  );
}

function OpenSourceIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function UnlockedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

// --- Variation A: Component cards ---
// Big headline with a row of cards showing each open-source component

const components = [
  {
    name: 'Client SDK',
    desc: 'React, React Native, Vanilla JS',
    icon: (
      <svg
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    name: 'Server',
    desc: 'Sync engine, query engine, WAL',
    icon: (
      <svg
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
        <line x1="6" y1="6" x2="6.01" y2="6" />
        <line x1="6" y1="18" x2="6.01" y2="18" />
      </svg>
    ),
  },
  {
    name: 'Dashboard',
    desc: 'Explorer, auth, permissions',
    icon: (
      <svg
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
  },
  {
    name: 'CLI',
    desc: 'Schema push, migrations, config',
    icon: (
      <svg
        className="h-7 w-7"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
];

export function Slide7A() {
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
            'radial-gradient(ellipse at center, rgba(242,150,80,0.18) 0%, rgba(242,150,80,0.05) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <h2 className="text-center text-[80px] leading-[1.2] font-normal tracking-tight">
          <span className="text-orange-600">100%</span> Open Source
        </h2>
        <p className="mt-4 text-center text-2xl text-gray-500">
          Everything you need to run Instant, from client to server
        </p>

        <div className="mt-14 grid grid-cols-4 gap-5">
          {components.map((c) => (
            <div
              key={c.name}
              className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white/80 px-6 py-6 text-center shadow-sm"
            >
              <div className="text-gray-600">{c.icon}</div>
              <div className="text-lg font-semibold">{c.name}</div>
              <div className="text-sm text-gray-400">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Variation B: Repo tree in terminal ---
// Terminal-style mockup showing the monorepo structure

export function Slide7B() {
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
            'radial-gradient(ellipse at center, rgba(242,150,80,0.15) 0%, rgba(242,150,80,0.04) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full items-center justify-center gap-16 px-20">
        {/* Left: headline */}
        <div className="flex shrink-0 flex-col">
          <h2 className="text-[72px] leading-[1.2] font-normal tracking-tight">
            <span className="text-orange-600">100%</span>
            <br />
            Open Source
          </h2>
          <p className="mt-4 max-w-[340px] text-xl text-gray-500">
            Client, server, CLI, and dashboard. Everything you need to run
            Instant yourself.
          </p>
        </div>

        {/* Right: terminal */}
        <div className="w-[480px] overflow-hidden rounded-xl border border-gray-200 bg-[#FAFAF9] shadow-lg">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <div className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <div className="h-3 w-3 rounded-full bg-[#28C840]" />
            <span className="ml-2 font-mono text-xs text-gray-400">
              instantdb/instant
            </span>
          </div>
          {/* Content */}
          <div className="px-5 py-4 font-mono text-[15px] leading-relaxed text-gray-700">
            <div className="text-gray-400">$ tree -L 1</div>
            <div className="mt-2">
              <span className="text-orange-600">instant/</span>
            </div>
            <div className="text-gray-500">
              ├── <span className="font-medium text-gray-800">client/</span>
              <span className="ml-4 text-gray-400">
                React, RN, Vanilla JS SDKs
              </span>
            </div>
            <div className="text-gray-500">
              ├── <span className="font-medium text-gray-800">server/</span>
              <span className="ml-4 text-gray-400">
                Sync engine + query engine
              </span>
            </div>
            <div className="text-gray-500">
              ├── <span className="font-medium text-gray-800">cli/</span>
              <span className="ml-4 text-gray-400">
                Schema, migrations, config
              </span>
            </div>
            <div className="text-gray-500">
              ├── <span className="font-medium text-gray-800">dashboard/</span>
              <span className="ml-4 text-gray-400">Explorer, auth, perms</span>
            </div>
            <div className="text-gray-500">
              ├── <span className="font-medium text-gray-800">admin/</span>
              <span className="ml-4 text-gray-400">Server-side SDK</span>
            </div>
            <div className="text-gray-500">
              └── <span className="font-medium text-gray-800">examples/</span>
              <span className="ml-4 text-gray-400">Starter apps + demos</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Variation C: Architecture layers ---
// Simplified stack diagram showing all layers are open source

export function Slide7C() {
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
            'radial-gradient(ellipse at center, rgba(242,150,80,0.15) 0%, rgba(242,150,80,0.04) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full items-center justify-center gap-20 px-20">
        {/* Left: headline */}
        <div className="flex shrink-0 flex-col">
          <h2 className="text-[72px] leading-[1.2] font-normal tracking-tight">
            <span className="text-orange-600">100%</span>
            <br />
            Open Source
          </h2>
          <p className="mt-4 max-w-[340px] text-xl text-gray-500">
            Every single line of code behind the company lives on GitHub.
          </p>
        </div>

        {/* Right: stack diagram */}
        <div className="flex w-[420px] flex-col gap-3">
          {[
            {
              label: 'Client SDK',
              detail: 'React · React Native · Vanilla JS',
              color: 'bg-orange-50 border-orange-200',
            },
            {
              label: 'CLI & Dashboard',
              detail: 'Schema push · Explorer · Auth config',
              color: 'bg-orange-50/60 border-orange-200/80',
            },
            {
              label: 'Sync Engine',
              detail: 'Realtime queries · Optimistic updates · Offline',
              color: 'bg-orange-50/40 border-orange-200/60',
            },
            {
              label: 'Server',
              detail: 'Query engine · Permissions · WAL invalidator',
              color: 'bg-orange-50/20 border-orange-200/40',
            },
            {
              label: 'Storage',
              detail: 'Postgres · Triple store · Multi-tenant',
              color: 'bg-white border-gray-200',
            },
          ].map((layer) => (
            <div
              key={layer.label}
              className={`flex items-center justify-between rounded-lg border px-5 py-3.5 ${layer.color}`}
            >
              <div>
                <div className="font-semibold text-gray-800">{layer.label}</div>
                <div className="text-sm text-gray-400">{layer.detail}</div>
              </div>
              <UnlockedIcon className="h-5 w-5 shrink-0 text-orange-500" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Variation C2: GitHub-repo-style rows ---

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

const repos = [
  { name: 'client', desc: 'React, React Native, Vanilla JS SDKs' },
  { name: 'server', desc: 'Sync engine, query engine, WAL' },
  { name: 'cli', desc: 'Schema push, migrations, config' },
  { name: 'dashboard', desc: 'Explorer, auth, permissions' },
  { name: 'admin', desc: 'Server-side SDK' },
];

export function Slide7C2() {
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
            'radial-gradient(ellipse at center, rgba(242,150,80,0.15) 0%, rgba(242,150,80,0.04) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full items-center justify-center gap-16 px-20">
        {/* Left: headline */}
        <div className="flex shrink-0 flex-col">
          <h2 className="text-[72px] leading-[1.2] font-normal tracking-tight">
            <span className="text-orange-600">100%</span>
            <br />
            Open Source
          </h2>
          <p className="mt-4 max-w-[340px] text-xl text-gray-500">
            Every single line of code behind the company lives on GitHub.
          </p>
        </div>

        {/* Right: GitHub-style card with repo header + file rows */}
        <div className="w-[440px] -rotate-[2deg] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Repo header — matches GitHub's actual repo header */}
          <div className="flex items-center gap-3 border-b border-gray-200 bg-[#f6f8fa] px-5 py-4">
            <GitHubIcon className="h-9 w-9 shrink-0 text-[#1f2328]" />
            <img src="/img/icon/logo-512.svg" alt="" className="h-6 w-6" />
            <span className="text-xl text-[#656d76]">instantdb</span>
            <span className="text-xl text-[#656d76]">/</span>
            <span className="text-xl font-semibold text-[#1f2328]">
              instant
            </span>
            <svg
              className="ml-2 h-5 w-5 text-[#e3b341]"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279L12 19.771l-7.416 3.642 1.48-8.279L0 9.306l8.332-1.151z" />
            </svg>
            <span className="text-lg text-[#656d76]">10.1k</span>
            <svg
              className="h-5 w-5 text-[#1a7f37]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          {/* Layer rows as file listing */}
          {[
            {
              label: 'SDKs',
              detail: 'React, React Native, Svelte, SolidJS, Vanilla JS',
            },
            {
              label: 'Backend',
              detail: 'Sync engine, query engine, permissions',
            },
            { label: 'Dashboard', detail: 'Explorer, auth, app management' },
            { label: 'CLI', detail: 'Schema push, migrations, config' },
            { label: 'Admin SDK', detail: 'Server-side access for backends' },
          ].map((layer, i, arr) => (
            <div
              key={layer.label}
              className={`flex items-center justify-between px-5 py-3.5 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <div>
                <div className="font-semibold text-gray-800">{layer.label}</div>
                <div className="text-sm text-gray-400">{layer.detail}</div>
              </div>
              <svg
                className="h-5 w-5 shrink-0 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Variation D: Headline left, full repo screenshot right (with About sidebar) ---
export function Slide7D() {
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
            'radial-gradient(ellipse at center, rgba(242,150,80,0.15) 0%, rgba(242,150,80,0.04) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full items-center justify-center gap-14 px-16">
        <div className="flex shrink-0 flex-col">
          <h2 className="text-[72px] leading-[1.2] font-normal tracking-tight">
            <span className="text-orange-600">100%</span>
            <br />
            Open Source
          </h2>
          <p className="mt-4 max-w-[320px] text-xl text-gray-500">
            Client, server, CLI, and dashboard. All Apache-2.0.
          </p>
        </div>
        <div className="rotate-[1deg] overflow-hidden rounded-xl border border-gray-200 shadow-2xl">
          <img
            src="/img/slides/github-repo-full.png"
            alt="GitHub repo"
            className="h-[480px] w-auto object-cover object-top"
          />
        </div>
      </div>
    </div>
  );
}

// --- Variation D2: Same but with compact screenshot ---
export function Slide7D2() {
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
            'radial-gradient(ellipse at center, rgba(242,150,80,0.15) 0%, rgba(242,150,80,0.04) 50%, transparent 80%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full items-center justify-center gap-14 px-16">
        <div className="flex shrink-0 flex-col">
          <h2 className="text-[72px] leading-[1.2] font-normal tracking-tight">
            <span className="text-orange-600">100%</span>
            <br />
            Open Source
          </h2>
          <p className="mt-4 max-w-[320px] text-xl text-gray-500">
            Client, server, CLI, and dashboard. All Apache-2.0.
          </p>
        </div>
        <div className="rotate-[1deg] overflow-hidden rounded-xl border border-gray-200 shadow-2xl">
          <img
            src="/img/slides/github-repo-compact.png"
            alt="GitHub repo"
            className="h-[480px] w-auto object-cover object-top"
          />
        </div>
      </div>
    </div>
  );
}

// --- Variation E: Full-bleed repo screenshot as background with overlay headline ---
export function Slide7E() {
  return (
    <div
      className="relative flex overflow-hidden bg-[#FBF9F6]"
      style={{ width: SLIDE_W, height: SLIDE_H }}
    >
      {/* Screenshot as background */}
      <img
        src="/img/slides/github-repo.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-top opacity-[0.12]"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(251,249,246,0.3) 0%, rgba(251,249,246,0.9) 70%)',
        }}
      />
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <h2 className="text-center text-[80px] leading-[1.2] font-normal tracking-tight">
          <span className="text-orange-600">100%</span> Open Source
        </h2>
        <p className="mt-4 text-center text-2xl text-gray-500">
          Client, server, CLI, and dashboard. All Apache-2.0.
        </p>
        <div className="mt-12 flex items-center gap-8 text-xl text-gray-500">
          <span>2,200+ commits</span>
          <span className="text-gray-300">·</span>
          <span>197 branches</span>
          <span className="text-gray-300">·</span>
          <span>Apache-2.0 license</span>
        </div>
      </div>
    </div>
  );
}

// --- Variation F: Stacked — readme screenshot on top, repo on bottom, headline centered ---
export function Slide7F() {
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
            'radial-gradient(ellipse at center, rgba(242,150,80,0.15) 0%, rgba(242,150,80,0.04) 50%, transparent 80%)',
        }}
      />
      {/* Repo screenshot — top right, clipped */}
      <div className="absolute -top-6 -right-6 rotate-[2deg] overflow-hidden rounded-xl border border-gray-200 opacity-90 shadow-xl">
        <img
          src="/img/slides/github-repo.png"
          alt=""
          className="h-[300px] w-auto object-cover object-top"
        />
      </div>
      {/* README screenshot — bottom left, clipped */}
      <div className="absolute -bottom-8 -left-6 -rotate-[2deg] overflow-hidden rounded-xl border border-gray-200 opacity-90 shadow-xl">
        <img
          src="/img/slides/github-readme.png"
          alt=""
          className="h-[260px] w-auto object-cover object-top"
        />
      </div>
      {/* Centered headline */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center px-16">
        <div className="rounded-2xl bg-[#FBF9F6]/90 px-16 py-10 backdrop-blur-sm">
          <h2 className="text-center text-[80px] leading-[1.2] font-normal tracking-tight">
            <span className="text-orange-600">100%</span> Open Source
          </h2>
          <p className="mt-3 text-center text-2xl text-gray-500">
            Every layer. Apache-2.0 licensed.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Slide7Page() {
  return (
    <div className="flex min-h-screen flex-col items-start gap-16 bg-gray-100 p-12">
      <h1 className="text-2xl font-medium text-gray-500">
        Slide 7 — 100% Open Source
      </h1>

      <SlidePreview label="A — Component cards">
        <Slide7A />
      </SlidePreview>

      <SlidePreview label="B — Repo tree">
        <Slide7B />
      </SlidePreview>

      <SlidePreview label="C — Architecture layers">
        <Slide7C />
      </SlidePreview>

      <SlidePreview label="C2 — GitHub-style repos">
        <Slide7C2 />
      </SlidePreview>

      <SlidePreview label="D — Repo screenshot (full)">
        <Slide7D />
      </SlidePreview>

      <SlidePreview label="D2 — Repo screenshot (compact)">
        <Slide7D2 />
      </SlidePreview>

      <SlidePreview label="E — Repo as background">
        <Slide7E />
      </SlidePreview>

      <SlidePreview label="F — Stacked screenshots">
        <Slide7F />
      </SlidePreview>
    </div>
  );
}

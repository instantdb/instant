'use client';

import { useState } from 'react';
import { MainNav } from '@/components/marketingUi';
import { Section } from '@/components/new-landing/Section';
import { AnimateIn } from '@/components/new-landing/AnimateIn';
import { BatteriesForAI } from '@/components/new-landing/BatteriesForAI';
import Head from 'next/head';

// ─── Shared Section Header ─────────────────────────────

function BatteriesHeader() {
  return (
    <div className="sm:text-center">
      <h2 className="text-2xl font-semibold sm:text-5xl">
        Batteries included
      </h2>
      <p className="mt-12 max-w-2xl text-lg sm:mx-auto">
        Shipping real products means adding auth, permissions, file storage,
        and payments. Sometimes you want to share cursors, and sometimes you
        want to stream LLM content. Instant comes with these services out of
        the box, and they're designed to work well together.
      </p>
    </div>
  );
}

// ─── Demo Placeholders ──────────────────────────────────

function StreamsPlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50">
      <div className="text-center">
        <div className="text-3xl">~</div>
        <p className="mt-1 text-sm font-medium text-purple-400">
          Streams Demo
        </p>
        <p className="mt-0.5 text-xs text-purple-300">
          Drawing replay / LLM streaming
        </p>
      </div>
    </div>
  );
}

function PresencePlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/50">
      <div className="text-center">
        <div className="text-3xl">+</div>
        <p className="mt-1 text-sm font-medium text-teal-400">
          Presence Demo
        </p>
        <p className="mt-0.5 text-xs text-teal-300">
          Reactions / cursors / who's online
        </p>
      </div>
    </div>
  );
}

function AuthPlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-orange-300 bg-orange-50/50">
      <div className="text-center">
        <p className="text-sm font-medium text-orange-400">Auth Demo</p>
      </div>
    </div>
  );
}

function PermissionsPlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50">
      <div className="text-center">
        <p className="text-sm font-medium text-gray-400">Permissions Demo</p>
      </div>
    </div>
  );
}

function StoragePlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50">
      <div className="text-center">
        <p className="text-sm font-medium text-indigo-400">Storage Demo</p>
      </div>
    </div>
  );
}

function PaymentsPlaceholder() {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50">
      <div className="text-center">
        <p className="text-sm font-medium text-blue-400">Payments Demo</p>
      </div>
    </div>
  );
}

// ─── Text blocks ────────────────────────────────────────

function StreamsText() {
  return (
    <div>
      <h3 className="text-2xl font-semibold sm:text-3xl">Streams</h3>
      <p className="mt-2 text-lg">
        Use streams to broadcast ephemeral data in real-time. Stream LLM
        responses token-by-token, replay drawings, or push live updates
        &mdash; all synced across clients instantly.
      </p>
    </div>
  );
}

function PresenceText() {
  return (
    <div>
      <h3 className="text-2xl font-semibold sm:text-3xl">Presence</h3>
      <p className="mt-2 text-lg">
        Use presence to show who's online, share cursors, broadcast typing
        indicators, and send reactions. Build collaborative experiences
        where users can feel each other.
      </p>
    </div>
  );
}

function AuthText() {
  return (
    <div>
      <h3 className="text-2xl font-semibold sm:text-3xl">Auth</h3>
      <p className="mt-2 text-lg">
        Use auth to enable your users to sign up for your app. With Instant
        you can easily enable sign up via email, Google, Apple, GitHub,
        Clerk, and more.
      </p>
    </div>
  );
}

function PermissionsText() {
  return (
    <div>
      <h3 className="text-2xl font-semibold sm:text-3xl">Permissions</h3>
      <p className="mt-2 text-lg">
        Use permissions to control who can access and modify data in your
        app. These rules run on the Instant backend, so they can never be
        bypassed.
      </p>
    </div>
  );
}

function StorageText() {
  return (
    <div>
      <h3 className="text-2xl font-semibold sm:text-3xl">Storage</h3>
      <p className="mt-2 text-lg">
        Use storage to allow users to upload images, video, audio, and more.
      </p>
    </div>
  );
}

function PaymentsText() {
  return (
    <div>
      <h3 className="text-2xl font-semibold sm:text-3xl">Payments</h3>
      <p className="mt-2 text-lg">
        Build apps that monetize. Easily add one-time purchases,
        subscriptions, or usage-based billing by telling AI to add Stripe to
        your Instant app.
      </p>
    </div>
  );
}

// ─── Layout A ───────────────────────────────────────────
// Original 3-col top row, then alternating wide rows for
// Payments, Streams, and Presence

function LayoutA() {
  return (
    <div className="space-y-16">
      <BatteriesHeader />

      {/* Row 1: Auth | Permissions | Storage — 3 equal columns */}
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <AuthText />
          <div className="bg-radial from-white to-[#FFF9F4] px-5 py-12">
            <AuthPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <PermissionsText />
          <div className="bg-radial from-white to-[#F7F7F7] px-5 py-12">
            <PermissionsPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <StorageText />
          <div className="bg-radial from-white to-[#EEF2FF] px-5 py-12">
            <StoragePlaceholder />
          </div>
        </div>
      </div>

      {/* Row 2: Payments — text left, demo right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-1">
          <PaymentsText />
        </div>
        <div className="col-span-2 bg-radial from-white to-[#FFF9F4] px-6 py-6">
          <PaymentsPlaceholder />
        </div>
      </div>

      {/* Row 3: Streams — demo left, text right (flipped) */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-2 bg-radial from-white to-[#F3E8FF] px-6 py-6">
          <StreamsPlaceholder />
        </div>
        <div className="col-span-1">
          <StreamsText />
        </div>
      </div>

      {/* Row 4: Presence — text left, demo right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-1">
          <PresenceText />
        </div>
        <div className="col-span-2 bg-radial from-white to-[#F0FDFA] px-6 py-6">
          <PresencePlaceholder />
        </div>
      </div>
    </div>
  );
}

// ─── Layout B ───────────────────────────────────────────
// 3-col top, then 2-col for Payments+Streams, then
// full-width Presence

function LayoutB() {
  return (
    <div className="space-y-16">
      <BatteriesHeader />

      {/* Row 1: Auth | Permissions | Storage */}
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <AuthText />
          <div className="bg-radial from-white to-[#FFF9F4] px-5 py-12">
            <AuthPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <PermissionsText />
          <div className="bg-radial from-white to-[#F7F7F7] px-5 py-12">
            <PermissionsPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <StorageText />
          <div className="bg-radial from-white to-[#EEF2FF] px-5 py-12">
            <StoragePlaceholder />
          </div>
        </div>
      </div>

      {/* Row 2: Payments | Streams — 2 equal columns */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <PaymentsText />
          <div className="bg-radial from-white to-[#FFF9F4] px-5 py-8">
            <PaymentsPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <StreamsText />
          <div className="bg-radial from-white to-[#F3E8FF] px-5 py-8">
            <StreamsPlaceholder />
          </div>
        </div>
      </div>

      {/* Row 3: Presence — full width, text left + demo right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-1">
          <PresenceText />
        </div>
        <div className="col-span-2 bg-radial from-white to-[#F0FDFA] px-6 py-6">
          <PresencePlaceholder />
        </div>
      </div>
    </div>
  );
}

// ─── Layout C ───────────────────────────────────────────
// 3+3: two rows of 3 equal columns

function LayoutC() {
  return (
    <div className="space-y-16">
      <BatteriesHeader />

      {/* Row 1: Auth | Permissions | Storage */}
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <AuthText />
          <div className="bg-radial from-white to-[#FFF9F4] px-5 py-12">
            <AuthPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <PermissionsText />
          <div className="bg-radial from-white to-[#F7F7F7] px-5 py-12">
            <PermissionsPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <StorageText />
          <div className="bg-radial from-white to-[#EEF2FF] px-5 py-12">
            <StoragePlaceholder />
          </div>
        </div>
      </div>

      {/* Row 2: Payments | Streams | Presence */}
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <PaymentsText />
          <div className="bg-radial from-white to-[#FFF9F4] px-5 py-12">
            <PaymentsPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <StreamsText />
          <div className="bg-radial from-white to-[#F3E8FF] px-5 py-12">
            <StreamsPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <PresenceText />
          <div className="bg-radial from-white to-[#F0FDFA] px-5 py-12">
            <PresencePlaceholder />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Layout D ───────────────────────────────────────────
// 2-col top (Auth + Permissions), then 3-col middle
// (Storage + Streams + Presence), then full-width Payments

function LayoutD() {
  return (
    <div className="space-y-16">
      <BatteriesHeader />

      {/* Row 1: Auth | Permissions — 2 columns */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-4">
          <AuthText />
          <div className="bg-radial from-white to-[#FFF9F4] px-5 py-12">
            <AuthPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <PermissionsText />
          <div className="bg-radial from-white to-[#F7F7F7] px-5 py-12">
            <PermissionsPlaceholder />
          </div>
        </div>
      </div>

      {/* Row 2: Storage | Streams | Presence — 3 columns */}
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-4">
          <StorageText />
          <div className="bg-radial from-white to-[#EEF2FF] px-5 py-12">
            <StoragePlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <StreamsText />
          <div className="bg-radial from-white to-[#F3E8FF] px-5 py-12">
            <StreamsPlaceholder />
          </div>
        </div>
        <div className="space-y-4">
          <PresenceText />
          <div className="bg-radial from-white to-[#F0FDFA] px-5 py-12">
            <PresencePlaceholder />
          </div>
        </div>
      </div>

      {/* Row 3: Payments — full width, text left + demo right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-1">
          <PaymentsText />
        </div>
        <div className="col-span-2 bg-radial from-white to-[#FFF9F4] px-6 py-6">
          <PaymentsPlaceholder />
        </div>
      </div>
    </div>
  );
}

// ─── Layout E ───────────────────────────────────────────
// Alternating wide rows: each feature gets a full-width
// row with text on one side and demo on the other,
// alternating left/right. More "storytelling" feel.

function LayoutE() {
  return (
    <div className="space-y-16">
      <BatteriesHeader />

      {/* Auth — text left, demo right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-1">
          <AuthText />
        </div>
        <div className="col-span-2 bg-radial from-white to-[#FFF9F4] px-6 py-6">
          <AuthPlaceholder />
        </div>
      </div>

      {/* Permissions — demo left, text right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-2 bg-radial from-white to-[#F7F7F7] px-6 py-6">
          <PermissionsPlaceholder />
        </div>
        <div className="col-span-1">
          <PermissionsText />
        </div>
      </div>

      {/* Storage — text left, demo right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-1">
          <StorageText />
        </div>
        <div className="col-span-2 bg-radial from-white to-[#EEF2FF] px-6 py-6">
          <StoragePlaceholder />
        </div>
      </div>

      {/* Payments — demo left, text right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-2 bg-radial from-white to-[#FFF9F4] px-6 py-6">
          <PaymentsPlaceholder />
        </div>
        <div className="col-span-1">
          <PaymentsText />
        </div>
      </div>

      {/* Streams — text left, demo right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-1">
          <StreamsText />
        </div>
        <div className="col-span-2 bg-radial from-white to-[#F3E8FF] px-6 py-6">
          <StreamsPlaceholder />
        </div>
      </div>

      {/* Presence — demo left, text right */}
      <div className="grid grid-cols-3 items-center gap-7">
        <div className="col-span-2 bg-radial from-white to-[#F0FDFA] px-6 py-6">
          <PresencePlaceholder />
        </div>
        <div className="col-span-1">
          <PresenceText />
        </div>
      </div>
    </div>
  );
}

// ─── Layout F ───────────────────────────────────────────
// "Bento" style: mixed grid with varying spans
// Row 1: Auth (1 col) | Permissions (2 cols wide)
// Row 2: Storage (2 cols wide) | Payments (1 col)
// Row 3: Streams (full width)
// Row 4: Presence (full width, centered)

function LayoutF() {
  return (
    <div className="space-y-16">
      <BatteriesHeader />

      <div className="grid grid-cols-3 gap-6">
        {/* Auth — 1 col */}
        <div className="col-span-1 space-y-4">
          <AuthText />
          <div className="bg-radial from-white to-[#FFF9F4] px-5 py-12">
            <AuthPlaceholder />
          </div>
        </div>
        {/* Permissions — 2 cols */}
        <div className="col-span-2 space-y-4">
          <PermissionsText />
          <div className="bg-radial from-white to-[#F7F7F7] px-5 py-12">
            <PermissionsPlaceholder />
          </div>
        </div>

        {/* Storage — 2 cols */}
        <div className="col-span-2 space-y-4">
          <StorageText />
          <div className="bg-radial from-white to-[#EEF2FF] px-5 py-8">
            <StoragePlaceholder />
          </div>
        </div>
        {/* Payments — 1 col */}
        <div className="col-span-1 space-y-4">
          <PaymentsText />
          <div className="bg-radial from-white to-[#FFF9F4] px-5 py-8">
            <PaymentsPlaceholder />
          </div>
        </div>

        {/* Streams — 1 col text + 2 col demo */}
        <div className="col-span-1 flex items-center">
          <StreamsText />
        </div>
        <div className="col-span-2 bg-radial from-white to-[#F3E8FF] px-6 py-6">
          <StreamsPlaceholder />
        </div>

        {/* Presence — 2 col demo + 1 col text */}
        <div className="col-span-2 bg-radial from-white to-[#F0FDFA] px-6 py-6">
          <PresencePlaceholder />
        </div>
        <div className="col-span-1 flex items-center">
          <PresenceText />
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

const layouts = [
  {
    id: 'A',
    label: 'A: 3-col top + alternating wide rows',
    description:
      'Original 3-col row for Auth/Perms/Storage, then Payments/Streams/Presence each get a full-width alternating row.',
    component: LayoutA,
  },
  {
    id: 'B',
    label: 'B: 3-col top + 2-col middle + wide bottom',
    description:
      'Auth/Perms/Storage in 3 cols, Payments and Streams share a 2-col row, Presence gets a full-width row.',
    component: LayoutB,
  },
  {
    id: 'C',
    label: 'C: 3+3 symmetric grid',
    description:
      'Two rows of 3 equal columns. Clean and symmetric. Auth/Perms/Storage on top, Payments/Streams/Presence on bottom.',
    component: LayoutC,
  },
  {
    id: 'D',
    label: 'D: 2-3-wide pyramid',
    description:
      'Auth+Perms in 2 cols, Storage+Streams+Presence in 3 cols, Payments wide at the bottom.',
    component: LayoutD,
  },
  {
    id: 'E',
    label: 'E: All alternating wide rows',
    description:
      'Every feature gets a full-width row with text on one side and demo on the other, alternating left/right. Storytelling feel.',
    component: LayoutE,
  },
  {
    id: 'F',
    label: 'F: Bento grid',
    description:
      'Mixed spans in a 3-col grid: some items take 1 col, some take 2. Creates visual variety and hierarchy.',
    component: LayoutF,
  },
];

export default function LayoutExplorations() {
  const [activeLayout, setActiveLayout] = useState('A');
  const ActiveComponent =
    layouts.find((l) => l.id === activeLayout)?.component ?? LayoutA;
  const activeInfo = layouts.find((l) => l.id === activeLayout);

  return (
    <div className="text-off-black relative">
      <MainNav transparent />
      <Head>
        <title>Batteries Layout Explorations</title>
      </Head>
      <main className="flex-1">
        {/* Sticky layout picker */}
        <div className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="landing-width mx-auto flex items-center gap-4 py-3">
            <span className="text-sm font-semibold text-gray-500">
              Layout:
            </span>
            <div className="flex gap-2">
              {layouts.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setActiveLayout(l.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeLayout === l.id
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {l.id}
                </button>
              ))}
            </div>
            {activeInfo && (
              <p className="ml-4 text-sm text-gray-500">
                {activeInfo.description}
              </p>
            )}
          </div>
        </div>

        {/* Active layout */}
        <Section id="batteries-for-ai">
          <ActiveComponent />
        </Section>

        {/* For reference: the current layout */}
        <div className="border-t-4 border-dashed border-gray-300">
          <div className="landing-width mx-auto py-6">
            <p className="text-center text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Current layout (for reference)
            </p>
          </div>
          <Section id="batteries-current">
            <BatteriesForAI />
          </Section>
        </div>
      </main>
    </div>
  );
}

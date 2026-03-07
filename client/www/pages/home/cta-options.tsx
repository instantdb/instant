'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

const COMMAND = 'npx create-instant-app';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="cursor-pointer rounded-md p-1 text-gray-400 transition-colors hover:text-gray-600"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg
          className="h-4 w-4 text-green-500"
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
      ) : (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
          />
        </svg>
      )}
    </button>
  );
}

function CommandBar({ label }: { label: string }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium tracking-wide text-gray-500 uppercase">
        {label}
      </div>
      <div className="inline-flex w-full max-w-xl items-center gap-3 rounded-2xl border border-gray-200 bg-gray-100 px-4 py-3 font-mono text-base shadow-sm sm:text-lg">
        <span className="text-orange-600">$</span>
        <span className="min-w-0 flex-1 truncate text-left text-gray-700">
          {COMMAND}
        </span>
        <CopyButton text={COMMAND} />
      </div>
    </div>
  );
}

function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-base font-medium text-white transition-colors hover:bg-orange-700"
    >
      {children}
    </Link>
  );
}

function SecondaryLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      {children}
    </Link>
  );
}

function Stage() {
  return (
    <div className="mx-auto mt-10 max-w-[1100px]">
      <div className="aspect-video rounded-[2rem] bg-gray-100 shadow-[0_28px_90px_rgba(0,0,0,0.18)]" />
    </div>
  );
}

function HeroShell({
  optionLabel,
  optionDesc,
  recommendation,
  headline,
  body,
  children,
}: {
  optionLabel: string;
  optionDesc: string;
  recommendation?: string;
  headline: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="border-y border-gray-200 bg-white">
      <div className="bg-orange-50 px-6 py-3">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold tracking-wide text-orange-600 uppercase">
              {optionLabel}
            </span>
            <span className="text-sm text-gray-500">{optionDesc}</span>
          </div>
          {recommendation ? (
            <span className="text-sm font-medium text-orange-700">
              {recommendation}
            </span>
          ) : null}
        </div>
      </div>

      <section className="pt-28 pb-8 sm:pt-32 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="mx-auto max-w-4xl text-4xl font-semibold text-balance sm:text-6xl">
              {headline}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-balance text-gray-600 sm:text-xl">
              {body}
            </p>

            <div className="mx-auto mt-8 max-w-4xl">{children}</div>
            <Stage />
          </div>
        </div>
      </section>
    </div>
  );
}

function OptionA() {
  return (
    <HeroShell
      optionLabel="Option A"
      optionDesc="Command + dashboard button"
      recommendation="Most direct"
      headline="A backend for AI-coded apps"
      body="Auth, permissions, storage, and streams out of the box. Optimistic, collaborative, and offline by default."
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <CommandBar label="Try without signing up" />
        <PrimaryLink href="/dash">Open dashboard</PrimaryLink>
      </div>
    </HeroShell>
  );
}

function OptionB() {
  return (
    <HeroShell
      optionLabel="Option B"
      optionDesc="Command first, lighter secondary actions"
      headline="Build realtime apps with your agent"
      body="Start with one command. Keep the same backend when the prototype turns into something real."
    >
      <div className="flex flex-col items-center gap-4">
        <CommandBar label="Start here" />
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500">
          <span>or</span>
          <Link
            href="/dash"
            className="font-medium text-orange-600 underline underline-offset-4 hover:text-orange-700"
          >
            open dashboard
          </Link>
          <Link
            href="/docs"
            className="font-medium text-orange-600 underline underline-offset-4 hover:text-orange-700"
          >
            read docs
          </Link>
        </div>
      </div>
    </HeroShell>
  );
}

function OptionC() {
  return (
    <HeroShell
      optionLabel="Option C"
      optionDesc="Two short paths with equal weight"
      headline="Try Instant without signing up"
      body="Spin up an app and a temporary backend first. Create a project when you want to keep going."
    >
      <div className="grid gap-4 text-left sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-gray-200 bg-white p-6 shadow-sm">
          <CommandBar label="Start in the CLI" />
        </div>
        <div className="rounded-[1.5rem] border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            Or jump into the product
          </div>
          <div className="mt-2 text-xl font-semibold text-gray-900">
            Create a project
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Best if you already know you want a durable app in the dashboard.
          </p>
          <div className="mt-5">
            <SecondaryLink href="/dash">Open dashboard</SecondaryLink>
          </div>
        </div>
      </div>
    </HeroShell>
  );
}

export default function CTAOptionsPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            CTA Layout Concepts
          </h1>
          <p className="mx-auto mt-3 max-w-3xl text-sm text-gray-500 sm:text-base">
            Cut back to the intro only: lead with the core value, then show the
            fastest way to start.
          </p>
        </div>
      </div>

      <div className="space-y-12 pb-24">
        <OptionA />
        <OptionB />
        <OptionC />
      </div>
    </div>
  );
}

'use client';

import Image from 'next/image';
import { AnimateIn } from './AnimateIn';

// Auth provider logo grid
function AuthProviderGrid() {
  const providers = [
    { name: 'Email', icon: <EmailIcon /> },
    {
      name: 'Google',
      icon: (
        <Image src="/img/google_g.svg" alt="Google" width={24} height={24} />
      ),
    },
    {
      name: 'Apple',
      icon: (
        <Image
          src="/img/apple_logo_black.svg"
          alt="Apple"
          width={24}
          height={24}
        />
      ),
    },
    {
      name: 'GitHub',
      icon: <Image src="/img/github.svg" alt="GitHub" width={24} height={24} />,
    },
    {
      name: 'Clerk',
      icon: (
        <Image
          src="/img/clerk_logo_black.svg"
          alt="Clerk"
          width={24}
          height={24}
        />
      ),
    },
  ];

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="grid grid-cols-2 gap-3">
        {providers.map((p) => (
          <div
            key={p.name}
            className="flex flex-col items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 transition-colors hover:border-orange-200 hover:bg-orange-50 sm:p-4"
          >
            <div className="flex h-6 w-6 items-center justify-center">
              {p.icon}
            </div>
            <span className="text-xs font-medium">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Storage visual showing two mini app mockups
function StorageVisual() {
  return <div className="grow bg-blue-200/20 py-24"></div>;
}

// Permissions visual showing access control
function PermissionsVisual() {
  const rules = [
    {
      action: 'read',
      rule: 'true',
      comment: 'Anyone can read',
      color: 'text-green-600',
    },
    {
      action: 'create',
      rule: 'auth.id != null',
      comment: 'Must be logged in',
      color: 'text-blue-600',
    },
    {
      action: 'update',
      rule: 'isOwner',
      comment: 'Only the owner',
      color: 'text-orange-600',
    },
    {
      action: 'delete',
      rule: 'isOwner',
      comment: 'Only the owner',
      color: 'text-red-600',
    },
  ];

  return (
    <div className="rounded-xl bg-white p-2 shadow-sm">
      <div className="space-y-2">
        {rules.map((r) => (
          <div
            key={r.action}
            className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5"
          >
            <div className="flex items-center gap-3">
              <span className={`font-mono text-sm font-semibold ${r.color}`}>
                {r.action}
              </span>
              <span className="font-mono text-sm">{r.rule}</span>
            </div>
            <span className="hidden text-xs text-gray-400 sm:block">
              {r.comment}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Payments visual — hand-drawn SVG illustrations
function OneTimeSVG({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none">
      <rect
        x="15"
        y="28"
        width="70"
        height="44"
        rx="6"
        stroke="rgb(37 99 235 / 0.5)"
        strokeWidth="2.5"
        fill="rgb(37 99 235 / 0.08)"
      />
      <rect x="15" y="40" width="70" height="8" fill="rgb(37 99 235 / 0.15)" />
      <rect
        x="24"
        y="52"
        width="12"
        height="10"
        rx="2"
        fill="rgb(37 99 235 / 0.25)"
        stroke="rgb(37 99 235 / 0.4)"
        strokeWidth="1"
      />
      <circle cx="52" cy="60" r="1.5" fill="rgb(37 99 235 / 0.3)" />
      <circle cx="57" cy="60" r="1.5" fill="rgb(37 99 235 / 0.3)" />
      <circle cx="62" cy="60" r="1.5" fill="rgb(37 99 235 / 0.3)" />
      <circle cx="67" cy="60" r="1.5" fill="rgb(37 99 235 / 0.3)" />
    </svg>
  );
}

function SubscriptionSVG({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none">
      <path
        d="M50 20c16 0 28 12 28 28s-12 28-28 28"
        stroke="rgb(147 51 234 / 0.6)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M50 76c-16 0-28-12-28-28s12-28 28-28"
        stroke="rgb(147 51 234 / 0.35)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      <polygon points="50,16 56,24 44,24" fill="rgb(147 51 234 / 0.6)" />
      <polygon points="50,80 44,72 56,72" fill="rgb(147 51 234 / 0.5)" />
      <text
        x="50"
        y="54"
        textAnchor="middle"
        fontSize="18"
        fontWeight="bold"
        fill="rgb(147 51 234 / 0.7)"
      >
        $
      </text>
    </svg>
  );
}

function UsageBasedSVG({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none">
      <rect
        x="18"
        y="60"
        width="10"
        height="18"
        rx="2"
        fill="rgb(22 163 74 / 0.2)"
        stroke="rgb(22 163 74 / 0.4)"
        strokeWidth="1.5"
      />
      <rect
        x="33"
        y="46"
        width="10"
        height="32"
        rx="2"
        fill="rgb(22 163 74 / 0.3)"
        stroke="rgb(22 163 74 / 0.4)"
        strokeWidth="1.5"
      />
      <rect
        x="48"
        y="36"
        width="10"
        height="42"
        rx="2"
        fill="rgb(22 163 74 / 0.4)"
        stroke="rgb(22 163 74 / 0.5)"
        strokeWidth="1.5"
      />
      <rect
        x="63"
        y="26"
        width="10"
        height="52"
        rx="2"
        fill="rgb(22 163 74 / 0.5)"
        stroke="rgb(22 163 74 / 0.6)"
        strokeWidth="1.5"
      />
      <path
        d="M23 58 Q40 44 53 34 T73 22"
        stroke="rgb(22 163 74 / 0.6)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="3 3"
      />
      <line
        x1="14"
        y1="80"
        x2="80"
        y2="80"
        stroke="rgb(22 163 74 / 0.25)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function PaymentsVisual() {
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="flex flex-col items-center gap-2">
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-blue-50">
          <OneTimeSVG className="h-32 w-32" />
        </div>
        <p className="text-sm font-medium text-gray-700">One-time</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-purple-50">
          <SubscriptionSVG className="h-32 w-32" />
        </div>
        <p className="text-sm font-medium text-gray-700">Subscription</p>
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-green-50">
          <UsageBasedSVG className="h-32 w-32" />
        </div>
        <p className="text-sm font-medium text-gray-700">Usage-based</p>
      </div>
    </div>
  );
}

// Icons
function EmailIcon() {
  return (
    <svg
      className="h-6 w-6 text-gray-700"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
      />
    </svg>
  );
}

export function BatteriesForAI() {
  return (
    <div className="space-y-16">
      {/* Section header */}
      <AnimateIn>
        <div className="sm:text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-7xl">
            Batteries included
          </h2>
          <p className="mt-12 max-w-2xl text-lg sm:mx-auto">
            Your AI built a todo app. But there's no login, no file uploads, and
            anyone can see your tasks. You need auth, permissions, storage and
            payments. Instant has them built in.
          </p>
        </div>
      </AnimateIn>

      {/* Features */}
      <div className="grid auto-rows-fr grid-cols-3 gap-6">
        {/* Auth */}
        <AnimateIn className="flex">
          <div className="col-span-1 space-y-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Auth
              </h3>
              <p className="mt-2 text-lg">
                Use auth to enable your users to sign up for your app. WIth
                Instant you can easily enable sign up via email, Google, Apple,
                GitHub, Clerk, and more.
              </p>
            </div>
            <div className="bg-radial from-white to-[#FFF9F4] px-5 py-12">
              <AuthProviderGrid />
            </div>
          </div>
        </AnimateIn>

        {/* Permissions */}
        <AnimateIn className="flex">
          <div className="flex flex-col space-y-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Permissions
              </h3>
              <p className="mt-2 text-lg">
                Use permissions to control who can access and modify data in
                your app. These rules run on the Instant backend, so they can
                never be bypassed.
              </p>
            </div>
            <div className="grow bg-radial from-white to-[#F7F7F7] px-5 py-12">
              <PermissionsVisual />
            </div>
          </div>
        </AnimateIn>

        {/* Storage */}
        <AnimateIn className="flex">
          <div className="flex flex-col space-y-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Storage
              </h3>
              <p className="mt-2 text-lg">
                Use storage to allow users to upload images, video, audio, and
                more.
              </p>
            </div>
            <StorageVisual />
          </div>
        </AnimateIn>

        {/* Payments */}
      </div>
      <AnimateIn>
        <div className="grid grid-cols-3 items-center gap-7">
          <div className="col-span-1">
            <h3 className="text-2xl font-semibold sm:text-3xl">Payments</h3>
            <p className="mt-2 text-lg">
              Build apps that monetize. Easily add one-time purchases,
              subscriptions, or usage-based billing by telling AI to add Stripe
              to your Instant app.
            </p>
          </div>
          <div className="col-span-2">
            <div className="bg-radial from-white to-[#FFF9F4] px-32 py-6">
              <PaymentsVisual />
            </div>
          </div>
        </div>
      </AnimateIn>
    </div>
  );
}

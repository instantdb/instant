import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import {
  LandingContainer,
  LandingFooter,
  MainNav,
  SectionWide,
} from '@/components/marketingUi';
import { ProductNav } from '@/components/productPageUi';
import { Button, Fence, cn } from '@/components/ui';
import { permissionExamples } from './examples';

import googleIcon from '@/public/img/google_g.svg';
import appleIcon from '@/public/img/apple_logo_black.svg';
import githubIcon from '@/public/img/github.svg';
import linkedinIcon from '@/public/img/linkedin.svg';
import clerkIcon from '@/public/img/clerk_logo_black.svg';
import firebaseIcon from '@/public/img/firebase_auth.svg';

const authMethods = [
  { name: 'Google', icon: googleIcon, href: '/docs/auth/google-oauth' },
  { name: 'Apple', icon: appleIcon, href: '/docs/auth/apple' },
  { name: 'GitHub', icon: githubIcon, href: '/docs/auth/github-oauth' },
  { name: 'LinkedIn', icon: linkedinIcon, href: '/docs/auth/linkedin-oauth' },
  { name: 'Clerk', icon: clerkIcon, href: '/docs/auth/clerk' },
  { name: 'Firebase', icon: firebaseIcon, href: '/docs/auth/firebase' },
];

function AuthCard() {
  return (
    <div className="py-6 md:px-14 md:py-14">
      <div className="flex flex-col gap-8 md:flex-row md:items-center md:gap-20">
        <div className="flex-1">
          <h3 className="font-mono text-2xl font-bold">
            No need for a separate auth system
          </h3>
          <p className="mt-3 max-w-lg text-gray-600">
            Instant comes with a built-in auth system that supports multiple
            auth methods. Integration only takes a few lines of code.
          </p>
          <p className="mt-3 max-w-lg text-sm text-gray-500">
            Want to use another auth provider? You can do that too!
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-4">
          <div className="grid grid-cols-3 gap-5">
            {authMethods.map((method) => (
              <a
                key={method.name}
                href={method.href}
                className="flex h-20 w-20 items-center justify-center rounded-full border bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <Image
                  alt={`${method.name} icon`}
                  src={method.icon}
                  width={36}
                  height={36}
                />
              </a>
            ))}
          </div>
          <p className="text-xs text-gray-400">and more</p>
        </div>
      </div>
    </div>
  );
}

// --- Integrated with your database ---

const tables = [
  { name: '$users', highlight: true, fields: 'email, name, role' },
  { name: 'projects', highlight: false, fields: 'title, status' },
  { name: 'tasks', highlight: false, fields: 'body, completed' },
  { name: 'comments', highlight: false, fields: 'text, createdAt' },
];

function IntegratedCard() {
  return (
    <div className="py-6 md:px-14 md:py-14">
      <div className="flex flex-col gap-8 md:flex-row md:items-center md:gap-20">
        <div className="flex flex-col gap-4 md:flex-1">
          <h3 className="font-mono text-2xl font-bold">
            Users are just another table
          </h3>
          <p className="max-w-lg text-gray-600">
            The{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
              $users
            </code>{' '}
            table is a first-class table in your database. You can query it,
            link to it, and transact with it just like any other table. No need
            to sync user data from an external auth provider.
          </p>
        </div>
        <div className="min-w-0 md:order-first md:flex-1">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2 pb-3">
              <svg
                className="h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                />
              </svg>
              <span className="font-mono text-xs font-medium text-gray-500">
                My awesome app
              </span>
            </div>
            <div className="space-y-1.5">
              {tables.map((table) => (
                <div
                  key={table.name}
                  className={`flex items-center justify-between rounded-md px-4 py-2.5 ${
                    table.highlight
                      ? 'border border-orange-200 bg-orange-50'
                      : 'border border-white bg-white'
                  }`}
                >
                  <span
                    className={`font-mono text-sm font-medium ${
                      table.highlight ? 'text-orange-600' : 'text-gray-700'
                    }`}
                  >
                    {table.name}
                  </span>
                  <span className="text-xs text-gray-400">{table.fields}</span>
                </div>
              ))}
            </div>
          </div>
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

export default function Auth() {
  return (
    <LandingContainer>
      <Head>
        <title>Auth - Instant</title>
        <meta
          name="description"
          content="Users, permissions, and social logins come integrated with your data."
        />
      </Head>
      <div className="flex min-h-screen flex-col justify-between">
        <div>
          <MainNav />
          <ProductNav currentSlug="auth" />

          {/* Hero */}
          <div className="py-20">
            <SectionWide>
              <div className="flex flex-col gap-10">
                <div className="flex flex-col items-center gap-8 text-center">
                  <p className="font-mono text-sm font-medium tracking-widest text-orange-600 uppercase">
                    Instant Auth
                  </p>
                  <h2 className="font-mono text-3xl leading-snug font-bold tracking-wide md:text-5xl md:leading-tight">
                    Auth and Security
                    <br />
                    <span className="text-orange-600">out of the box.</span>
                  </h2>
                  <p className="max-w-lg text-lg text-gray-600">
                    Users are integrated into your database. No split brain.
                    Easy setup. Fine-grained access control.
                  </p>
                  <div className="flex gap-3">
                    <Button type="link" variant="cta" size="large" href="/dash">
                      Get started
                    </Button>
                    <Button
                      type="link"
                      variant="secondary"
                      size="large"
                      href="/docs/auth"
                    >
                      Read the docs
                    </Button>
                  </div>
                </div>
              </div>
            </SectionWide>
          </div>

          {/* Features */}
          <div className="my-16">
            <SectionWide>
              <div className="flex flex-col gap-12 md:gap-24">
                <AuthCard />
                <IntegratedCard />
                <div className="py-6 md:px-14 md:py-14">
                  <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-20">
                    <div className="flex flex-col gap-4 md:flex-1">
                      <h3 className="font-mono text-2xl font-bold">
                        Permissions for fine-grained access control
                      </h3>
                      <p className="max-w-lg text-gray-600">
                        Instant uses{' '}
                        <a
                          href="https://cel.dev/overview/cel-overview"
                          className="underline hover:text-gray-800"
                        >
                          Google's Common Expression Language
                        </a>{' '}
                        for defining permission rules. This is the same language
                        that powers security checks for Firebase, Kubernetes,
                        and Google Cloud IAM.
                      </p>
                      <p className="max-w-lg text-gray-600">
                        Instead of writing RLS policies or creating server
                        endpoints to enforce permissions, you can define your
                        rules as code and have them enforced for all queries and
                        transactions.
                      </p>
                      <p className="max-w-lg text-gray-600">
                        Your rules can traverse relationships in your data,
                        leverage auth, and use helper functions and variables to
                        express complex logic.
                      </p>
                    </div>
                    <div className="min-w-0 md:flex-1">
                      <PermissionsCard />
                    </div>
                  </div>
                </div>
              </div>
            </SectionWide>
          </div>

          {/* CTA */}
          <div className="mt-24 mb-20">
            <SectionWide>
              <div className="text-center">
                <h3 className="font-mono text-2xl font-bold tracking-wide md:text-4xl">
                  <span className="text-orange-600">Build secure apps</span>
                  <br className="hidden md:block" /> from your first prompt.
                </h3>
                <div className="mt-10 flex justify-center gap-3">
                  <Button type="link" variant="cta" href="/dash">
                    Get started
                  </Button>
                  <Button type="link" variant="secondary" href="/docs/auth">
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

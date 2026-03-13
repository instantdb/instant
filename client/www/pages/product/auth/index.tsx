import Head from 'next/head';
import Image from 'next/image';
import * as og from '@/lib/og';
import { MainNav, ProductNav, Link } from '@/components/marketingUi';
import { permissionExamples } from '@/lib/product/auth/examples';
import { Section } from '@/components/new-landing/Section';
import {
  LandingButton,
  SectionTitle,
  SectionSubtitle,
  Subheading,
} from '@/components/new-landing/typography';
import { Footer } from '@/components/new-landing/Footer';
import { TopWash } from '@/components/new-landing/TopWash';
import { AnimateIn } from '@/components/new-landing/AnimateIn';
import { TabbedCodeExample } from '@/components/new-landing/TabbedCodeExample';

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

const tables = [
  { name: '$users', highlight: true, fields: 'email, name, role' },
  { name: 'projects', highlight: false, fields: 'title, status' },
  { name: 'tasks', highlight: false, fields: 'body, completed' },
  { name: 'comments', highlight: false, fields: 'text, createdAt' },
];

function UsersTableDiagram() {
  return (
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
  );
}

export default function Auth() {
  const title = 'Auth - Instant';
  const description =
    'Users, permissions, and social logins come integrated with your data.';

  return (
    <div className="text-off-black w-full overflow-x-auto">
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta key="og:title" property="og:title" content={title} />
        <meta
          key="og:description"
          property="og:description"
          content={description}
        />
        <meta
          key="og:image"
          property="og:image"
          content={og.url({ title: 'Auth', section: 'Product' })}
        />
        <meta name="twitter:card" content="summary_large_image" />
      </Head>
      <MainNav transparent />

      {/* Hero */}
      <div className="relative pt-16">
        <TopWash />
        <ProductNav currentSlug="auth" />
        <Section className="relative pt-12 pb-6 sm:pt-16 sm:pb-10">
          <div className="flex flex-col items-center text-center">
            <SectionTitle>
              Auth and Security <br className="hidden md:block" />
              <span className="text-orange-600">out of the box.</span>
            </SectionTitle>
            <SectionSubtitle>{description}</SectionSubtitle>
            <div className="mt-8 flex gap-3">
              <LandingButton href="/dash">Get started</LandingButton>
              <LandingButton href="/docs/auth" variant="secondary">
                Read the docs
              </LandingButton>
            </div>
          </div>
        </Section>
      </div>

      {/* Features */}
      <Section className="pb-0 sm:pb-0">
        <div className="space-y-24">
          {/* No need for a separate auth system */}
          <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-center">
            <div className="space-y-4 md:max-w-[400px]">
              <Subheading>No need for a separate auth system</Subheading>
              <p className="mt-2 text-base">
                Instant comes with a built-in auth system that supports multiple
                auth methods. Integration only takes a few lines of code.
              </p>
              <p className="mt-2 text-base">
                Want to use another auth provider? You can do that too!
              </p>
            </div>
            <div className="min-w-0 grow lg:bg-radial lg:from-white lg:to-[#FFF9F4] lg:px-[66px] lg:py-[37px]">
              <div className="flex flex-col items-center gap-4">
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

          {/* Users are just another table */}
          <AnimateIn>
            <div className="flex flex-col-reverse items-stretch gap-8 md:flex-row md:items-center">
              <div className="lg:bg-surface/20 min-w-0 grow lg:px-[66px] lg:py-[37px]">
                <UsersTableDiagram />
              </div>
              <div className="space-y-4 md:max-w-[440px]">
                <Subheading>Users are just another table</Subheading>
                <p className="mt-2 text-base">
                  The{' '}
                  <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
                    $users
                  </code>{' '}
                  table is a first-class table in your database. You can query
                  it, link to it, and transact with it just like any other
                  table. No need to sync user data from an external auth
                  provider.
                </p>
              </div>
            </div>
          </AnimateIn>

          {/* Permissions */}
          <AnimateIn>
            <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-start">
              <div className="space-y-4 md:max-w-[400px]">
                <Subheading>Fine-grained access control</Subheading>
                <p className="mt-2 text-base">
                  Instant uses{' '}
                  <a
                    href="https://cel.dev/overview/cel-overview"
                    className="underline hover:text-gray-800"
                  >
                    Google's Common Expression Language
                  </a>{' '}
                  for defining permission rules. This is the same language that
                  powers security checks for Firebase, Kubernetes, and Google
                  Cloud IAM.
                </p>
                <p className="mt-2 text-base">
                  Instead of writing RLS policies or creating server endpoints
                  to enforce permissions, you can define your rules as code and
                  have them enforced for all queries and transactions.
                </p>
                <p className="mt-2 text-base">
                  Your rules can traverse relationships in your data, leverage
                  auth, and use helper functions and variables to express
                  complex logic.
                </p>
              </div>
              <div className="min-w-0 grow lg:bg-[#F0F5FA] lg:px-[66px] lg:py-[37px]">
                <TabbedCodeExample
                  examples={permissionExamples}
                  tabs={[
                    {
                      key: 'code',
                      label: 'instant.perms.ts',
                      language: 'typescript',
                    },
                  ]}
                />
              </div>
            </div>
          </AnimateIn>
        </div>
      </Section>

      {/* CTA */}
      <div className="relative overflow-hidden bg-[#F0F5FA]">
        <div className="pointer-events-none absolute top-0 right-0 left-0 z-[5] h-48 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-[5] h-48 bg-gradient-to-b from-transparent to-white" />
        <Section className="relative z-10">
          <AnimateIn>
            <div className="text-center">
              <SectionTitle>
                <span className="text-orange-600">Build secure apps</span>
                <br className="hidden md:block" /> from your first prompt.
              </SectionTitle>
              <div className="mt-10 flex justify-center gap-3">
                <LandingButton href="/dash">Get started</LandingButton>
                <LandingButton href="/docs/auth" variant="secondary">
                  Read the docs
                </LandingButton>
              </div>
              <p className="mt-6 text-base text-gray-500">
                Instant is{' '}
                <Link
                  href="https://github.com/instantdb/instant"
                  className="underline hover:text-gray-700"
                >
                  100% Open Source
                </Link>
              </p>
            </div>
          </AnimateIn>
        </Section>
      </div>

      <Footer />
    </div>
  );
}

module.exports = [
  {
    title: 'Introduction',
    links: [
      {
        title: 'Getting started w/ React',
        href: '/docs',
        nextHref: '/docs/create-instant-app',
      },
      {
        title: 'Getting started w/ React Native',
        href: '/docs/start-rn',
        prevHref: null,
        nextHref: '/docs/create-instant-app',
        optionalLLM: true,
      },
      {
        title: 'Getting started w/ Vanilla JS',
        href: '/docs/start-vanilla',
        prevHref: null,
        nextHref: '/docs/create-instant-app',
        optionalLLM: true,
      },
      {
        title: 'Getting started w/ TanStack Start',
        href: '/docs/start-tanstack',
        prevHref: null,
        nextHref: '/docs/create-instant-app',
        optionalLLM: true,
      },
      {
        title: 'Create Instant App',
        prevHref: null,
        href: '/docs/create-instant-app',
        nextHref: '/docs/workflow',
        optionalLLM: true,
      },
      {
        title: 'Recommended Workflow',
        href: '/docs/workflow',
        nextHref: '/docs/using-llms',
        optionalLLM: true,
      },
      { title: 'Using LLMs', href: '/docs/using-llms', optionalLLM: true },
    ],
  },
  {
    title: 'Working with data',
    links: [
      { title: 'Init', href: '/docs/init', prevHref: '/docs' },
      { title: 'Modeling data', href: '/docs/modeling-data' },
      { title: 'Writing data', href: '/docs/instaml' },
      { title: 'Reading data', href: '/docs/instaql' },
      { title: 'Instant on the backend', href: '/docs/backend' },
      { title: 'Patterns', href: '/docs/patterns' },
    ],
  },
  {
    title: 'Authentication and Permissions',
    links: [
      { title: 'Auth', href: '/docs/auth' },
      { title: 'Magic codes', href: '/docs/auth/magic-codes' },
      { title: 'Guest Auth', href: '/docs/auth/guest-auth' },
      {
        title: 'Google OAuth',
        href: '/docs/auth/google-oauth',
        optionalLLM: true,
      },
      {
        title: 'Sign In with Apple',
        href: '/docs/auth/apple',
        optionalLLM: true,
      },
      {
        title: 'GitHub OAuth',
        href: '/docs/auth/github-oauth',
        optionalLLM: true,
      },
      {
        title: 'LinkedIn OAuth',
        href: '/docs/auth/linkedin-oauth',
        optionalLLM: true,
      },
      { title: 'Clerk', href: '/docs/auth/clerk', optionalLLM: true },
      {
        title: 'Firebase Auth',
        href: '/docs/auth/firebase',
        optionalLLM: true,
      },
      { title: 'Permissions', href: '/docs/permissions' },
    ],
  },
  {
    title: 'Instant features',
    links: [
      { title: 'Managing users', href: '/docs/users' },
      {
        title: 'Presence, Cursors, and Activity',
        href: '/docs/presence-and-topics',
      },
      { title: 'Instant CLI', href: '/docs/cli' },
      { title: 'Devtool', href: '/docs/devtool', optionalLLM: true },
      {
        title: 'Platform API',
        href: '/docs/platform-api',
        optionalLLM: true,
      },
      {
        title: 'Explorer Component',
        href: '/docs/explorer-component',
        optionalLLM: true,
      },
      { title: 'Custom emails', href: '/docs/emails', optionalLLM: true },
      { title: 'App teams', href: '/docs/teams', optionalLLM: true },
      { title: 'Storage', href: '/docs/storage' },
      { title: 'Stripe Payments', href: '/docs/stripe-payments' },
      { title: 'Admin HTTP API', href: '/docs/http-api' },
      { title: '(Experimental) Next.js SSR', href: '/docs/next-ssr' },
    ],
  },
];

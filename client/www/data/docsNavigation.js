module.exports = [
  {
    title: 'Introduction',
    links: [
      {
        title: 'Getting started w/ React',
        href: '/docs',
        nextHref: '/docs/init',
      },
      {
        title: 'Getting started w/ React Native',
        href: '/docs/start-rn',
        prevHref: null,
        nextHref: '/docs/init',
      },
      {
        title: 'Getting started w/ Vanilla JS',
        href: '/docs/start-vanilla',
        prevHref: null,
        nextHref: '/docs/init',
      },
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
      { title: 'Showcase', href: '/docs/showcase' },
    ],
  },
  {
    title: 'Authentication and Permissions',
    links: [
      { title: 'Auth', href: '/docs/auth' },
      { title: 'Magic codes', href: '/docs/auth/magic-codes' },
      { title: 'Google OAuth', href: '/docs/auth/google-oauth' },
      { title: 'Sign In with Apple', href: '/docs/auth/apple' },
      { title: 'Clerk', href: '/docs/auth/clerk' },
      { title: 'Permissions', href: '/docs/permissions' },
    ],
  },
  {
    title: 'Platform features',
    links: [
      { title: 'Managing users', href: '/docs/users' },
      {
        title: 'Presence, Cursors, and Activity',
        href: '/docs/presence-and-topics',
      },
      { title: 'Instant CLI', href: '/docs/cli' },
      { title: 'Custom emails', href: '/docs/emails' },
      { title: 'App teams', href: '/docs/teams' },
      { title: 'Storage (beta)', href: '/docs/storage' },
    ],
  },
];

const path = require('path');
const withMarkdoc = require('@markdoc/next.js');

const componentsSrc = path.resolve(__dirname, '../packages/components/src');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md'],
  transpilePackages: ['@instantdb/components'],
  experimental: {
    optimizePackageImports: [
      'motion',
      'lodash',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
    ],
  },
  // Turbopack config (used with next dev --turbopack)
  turbopack: {
    resolveAlias: {
      '@instantdb/components/components/cn': '../packages/components/src/components/cn.ts',
      '@instantdb/components/components/button': '../packages/components/src/components/button.tsx',
      '@instantdb/components/components/primitives': '../packages/components/src/components/primitives.tsx',
      '@instantdb/components/components/tooltip': '../packages/components/src/components/tooltip.tsx',
      '@instantdb/components/components/code-editors': '../packages/components/src/components/code-editors.tsx',
      '@instantdb/components/components/ui': '../packages/components/src/components/ui.tsx',
      '@instantdb/components': '../packages/components/src/index.tsx',
      '@lib/*': '../packages/components/src/*',
    },
  },
  webpack: (config, { dev }) => {
    // Resolve @instantdb/components to source for Fast Refresh in development
    if (dev) {
      config.resolve.alias['@instantdb/components'] = componentsSrc;
      // Also add the @lib alias used within the components package
      config.resolve.alias['@lib'] = componentsSrc;
    }

    // Auto-inject og:image metadata for docs pages.
    // The markdoc loader generates:
    //   export const metadata = frontmatter.nextjs?.metadata;
    // We replace it with a version that merges in the og:image
    // based on the file path, so doc authors don't have to.
    config.module.rules.push({
      test: /\.md$/,
      include: path.resolve(__dirname, 'app/docs'),
      enforce: 'post',
      loader: path.resolve(__dirname, 'lib/docs-og-metadata-loader.js'),
    });

    return config;
  },
  async redirects() {
    return [
      {
        permanent: false,
        source: '/',
        has: [
          {
            type: 'host',
            value: 'docs.instantdb.com',
          },
        ],
        destination: 'https://instantdb.com/docs/',
      },
      {
        permanent: false,
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'docs.instantdb.com',
          },
        ],
        destination: 'https://instantdb.com/:path*',
      },
      {
        permanent: false,
        basePath: false,
        source: '/status',
        destination: 'https://status.instantdb.com',
      },
      // Redirect old search-param-based auth doc tabs to route segments
      ...[
        { page: 'apple', values: 'web-popup|web-redirect|native' },
        {
          page: 'google-oauth',
          values: 'web-google-button|web-redirect|rn-web|rn-native',
        },
        { page: 'github-oauth', values: 'web-redirect|rn-web' },
        { page: 'linkedin-oauth', values: 'web-redirect|rn-web' },
      ].map(({ page, values }) => ({
        permanent: true,
        source: `/docs/auth/${page}`,
        has: [{ type: 'query', key: 'method', value: `(?<method>${values})` }],
        destination: `/docs/auth/${page}/:method`,
      })),
      {
        permanent: true,
        source: '/docs/auth/magic-codes',
        has: [
          {
            type: 'query',
            key: 'platform',
            value: '(?<platform>react|react-native|vanilla)',
          },
        ],
        destination: '/docs/auth/magic-codes/:platform',
      },
      {
        permanent: true,
        source: '/examples',
        has: [{ type: 'query', key: 'tab', value: '(?<tab>mobile)' }],
        destination: '/examples/:tab',
      },
    ];
  },
  // Proxy to PostHog to avoid ad blockers
  async rewrites() {
    return [
      {
        source: '/a/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/a/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

module.exports = withMarkdoc({ dir: __dirname })(nextConfig);

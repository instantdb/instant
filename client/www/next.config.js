const path = require('path');
const withMarkdoc = require('@markdoc/next.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md'],
  transpilePackages: ['@instantdb/components'],
  webpack: (config, { dev }) => {
    // Resolve @instantdb/components to source for Fast Refresh in development
    if (dev) {
      const componentsSrc = path.resolve(
        __dirname,
        '../packages/components/src',
      );
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

module.exports = withMarkdoc()(nextConfig);

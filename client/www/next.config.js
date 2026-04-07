const path = require('path');
const fs = require('fs');
const withMarkdoc = require('@markdoc/next.js');

async function fetchStarCount() {
  const { init } = await import('@instantdb/admin');
  const db = init({
    appId:
      // process.env.NEXT_PUBLIC_FEEDBACK_APP_ID ||
      '5d9c6277-e6ac-42d6-8e51-2354b4870c05',
  }).asUser({ guest: true });
  const { instantRepo } = await import('./lib/constants.ts');
  const data = await db.query({
    ghStarTotals: {
      $: { where: { repoFullName: instantRepo }, limit: 1 },
    },
  });
  const count = data?.ghStarTotals?.[0]?.stargazersCount;
  if (count == null) {
    throw new Error('Missing star count');
  }
  return String(count);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
      {
        permanent: false,
        basePath: false,
        source: '/discord',
        destination: 'https://discord.com/invite/VU53p7uQcE',
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

// Berkeley Mono is a licensed font that we can't check into the repo.
// We fetch it from S3 on startup (dev server or build) so it ends up in the
// bundle but never in source control. See .gitignore for the exclusion.
const BERKELEY_MONO_FONTS = [
  'BerkeleyMono-Regular.woff2',
  'BerkeleyMono-Italic.woff2',
  'BerkeleyMono-Bold.woff2',
  'BerkeleyMono-BoldItalic.woff2',
  'BerkeleyMono-Regular.ttf',
  'BerkeleyMono-Bold.ttf',
];

async function fetchFonts() {
  const dest = path.join(__dirname, 'public', 'fonts');
  const baseUrl = 'https://stopaio.s3.amazonaws.com/public';
  await Promise.all(
    BERKELEY_MONO_FONTS.map(async (font) => {
      const filePath = path.join(dest, font);
      if (fs.existsSync(filePath)) return;
      console.log(`Downloading ${font}...`);
      const res = await fetch(`${baseUrl}/${font}`);
      if (!res.ok) throw new Error(`Failed to download ${font}: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    }),
  );
}

module.exports = async () => {
  await fetchFonts();
  const starCount = await fetchStarCount();
  if (starCount) {
    nextConfig.env = {
      ...nextConfig.env,
      NEXT_PUBLIC_FALLBACK_STAR_COUNT: starCount,
    };
  }
  return withMarkdoc()(nextConfig);
};

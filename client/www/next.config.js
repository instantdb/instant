const withMarkdoc = require('@markdoc/next.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md'],
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
    ];
  },
};

module.exports = withMarkdoc()(nextConfig);

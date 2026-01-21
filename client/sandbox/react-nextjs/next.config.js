/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  async redirects() {
    return [
      {
        source: '/oauth-redirect',
        destination: 'http://localhost:8888/runtime/oauth/callback',
        permanent: false,
      },
    ];
  },
};

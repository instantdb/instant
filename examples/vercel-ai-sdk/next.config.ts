import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.txt': { loaders: ['raw-loader'], as: '*.js' },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.txt$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;

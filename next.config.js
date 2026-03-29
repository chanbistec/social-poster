/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // better-sqlite3 is a native module — exclude from webpack bundling
      config.externals.push('better-sqlite3');
    }
    return config;
  },
};

module.exports = nextConfig;

import { createMDX } from 'fumadocs-mdx/next';
import { fileURLToPath } from 'node:url';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: { root: fileURLToPath(new URL('.', import.meta.url)) },
  devIndicators: false,
  async rewrites() {
    return [
      { source: '/demo', destination: '/demo/index.html' },
      { source: '/demo/x', destination: '/demo/index.html' },
      { source: '/demo/instagram', destination: '/demo/index.html' },
      { source: '/demo/lab', destination: '/demo/index.html' },
    ];
  },
};

export default withMDX(config);

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      { source: '/admin/:path*', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
      { source: '/login', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
      { source: '/setup-2fa', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker standalone build
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  // Proxy API requests to FastAPI backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/:path*`,
      },
    ];
  },

  // Security headers for production
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-XSS-Protection',          value: '1; mode=block' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  // Remove 'X-Powered-By: Next.js' header
  poweredByHeader: false,

  // Compress responses
  compress: true,

  images: {
    remotePatterns: [],
  },
};

export default nextConfig;

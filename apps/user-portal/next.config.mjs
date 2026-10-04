/** @type {import('next').NextConfig} */
const targetApi =
  process.env.BACKEND_API_URL ||
  process.env.NEXT_PUBLIC_USER_API_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://discs-hold-calcium-sections.trycloudflare.com/api'
    : 'http://localhost:4001/api');

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    domains: ['images.unsplash.com'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${targetApi}/:path*`,
      },
    ];
  },
};

export default nextConfig;

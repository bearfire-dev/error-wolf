/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  experimental: {
    viewTransition: true,
  },
  images: {
    qualities: [25, 35, 45, 55, 65, 75, 85, 90, 100],
  },
}

export default nextConfig

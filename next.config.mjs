/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  experimental: {
    viewTransition: true,
  },
  images: {
    // Only AVIF/WebP are valid here (Next 16 schema). Clients whose Accept
    // header does not match get optimized output as JPEG (or upstream type).
    formats: ["image/avif", "image/webp"],
    qualities: [25, 35, 45, 55, 60, 65, 75, 85, 90, 100],
  },
}

export default nextConfig

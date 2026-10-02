import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Enable Next 16.3 instant navigation and route-segment `instant` settings.
  cacheComponents: true,
  partialPrefetching: true,

  // Enable standalone output for minimal Docker image
  output: "standalone",

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  async rewrites() {
    // INTERNAL_API_URL is the container-to-container URL in Docker (e.g. http://api:3001)
    // Falls back to NEXT_PUBLIC_BACKEND_URL for local non-Docker development
    const apiTarget =
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "http://localhost:3001";

    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

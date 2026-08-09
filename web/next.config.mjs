/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for a small production Docker image.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "imagedelivery.net" },
    ],
  },
};

export default nextConfig;

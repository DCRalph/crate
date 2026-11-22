import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native or file-reading packages the server loads from node_modules as they are.
  serverExternalPackages: ["sharp", "music-metadata"],
  poweredByHeader: false,
  // The dev badge sits in the bottom corner, on top of the player bar.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nothing here is meant to be embedded in another site.
          { key: "X-Frame-Options", value: "DENY" },
          // Subsonic URLs carry credentials, so they must never leak as a referrer.
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;

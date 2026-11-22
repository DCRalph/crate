import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/** This machine's own network addresses, so the dev server can be opened from a phone on the same network. */
const ownAddresses = Object.values(networkInterfaces())
  .flatMap((addresses) => addresses ?? [])
  .filter((address) => address.family === "IPv4" && !address.internal)
  .map((address) => address.address);

const nextConfig: NextConfig = {
  // Native or file-reading packages the server loads from node_modules as they are.
  serverExternalPackages: ["sharp", "music-metadata"],
  poweredByHeader: false,
  // The dev badge sits in the bottom corner, on top of the player bar.
  devIndicators: false,
  // Dev only: hosts allowed to load /_next/* from the dev server. Without this a
  // page opened by IP address or .local name never becomes interactive.
  allowedDevOrigins: [...ownAddresses, "*.local"],
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating circular Next.js dev-tools badge (dev mode only, never in
  // production builds) reads as a stray widget over the product UI — hide it.
  // Compile/runtime error overlays still surface as normal.
  devIndicators: false,
};

export default nextConfig;

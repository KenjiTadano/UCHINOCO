import type { NextConfig } from "next";

const supabaseUrl = new URL(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.local",
);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: supabaseUrl.protocol === "http:" ? "http" : "https",
        hostname: supabaseUrl.hostname,
        port: supabaseUrl.port,
        pathname: "/storage/v1/object/sign/pet-avatars/**",
      },
      {
        protocol: supabaseUrl.protocol === "http:" ? "http" : "https",
        hostname: supabaseUrl.hostname,
        port: supabaseUrl.port,
        pathname: "/storage/v1/object/sign/pet-photos/**",
      },
    ],
  },
};

export default nextConfig;

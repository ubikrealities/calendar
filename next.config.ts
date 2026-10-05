import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Old event-type slugs that were renamed; keep shared links working.
  async redirects() {
    return [
      { source: "/book/60min", destination: "/book/30min-free", permanent: true },
      { source: "/book/60min-paid", destination: "/book/30min-paid", permanent: true },
      { source: "/book/consulting-package", destination: "/book/consulting-60", permanent: true },
    ];
  },
};

export default nextConfig;

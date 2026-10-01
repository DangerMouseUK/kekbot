import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./.env*", "./backups/**/*", "./test-results/**/*", "./output/**/*"] },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Frame-Options", value: "DENY" }
      ]
    }];
  }
};

export default config;

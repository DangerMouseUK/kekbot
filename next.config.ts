import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Assets already use unoptimized, authenticated URLs. Never ship an unused
  // image optimizer or its optional native image-processing libraries.
  images: { unoptimized: true },
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./.env*", "./backups/**/*", "./test-results/**/*", "./output/**/*", "./node_modules/**/sharp/**/*", "./node_modules/**/@img/**/*"],
    "next-server": ["**/node_modules/sharp/**", "**/@img/**"]
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Frame-Options", value: "DENY" }
      ]
    }, {
      // The dashboard's Widgets panel previews OBS sources in a same-origin frame.
      // Everything else, including the dashboard itself, stays unframeable.
      source: "/widgets/:path*",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }
      ]
    }];
  }
};

export default config;

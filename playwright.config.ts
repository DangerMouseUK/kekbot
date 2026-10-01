import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  outputDir: "output/playwright/results",
  use: { baseURL: "http://127.0.0.1:3137", trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:3137/api/health/ready",
    timeout: 90000,
    reuseExistingServer: false
  }
});

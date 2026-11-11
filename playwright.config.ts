import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    // GitHub-hosted Ubuntu runners include Chrome; skip duplicate 300 MB browser installs.
    channel: process.env.CI ? "chrome" : undefined,
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
  },
  webServer: [
    // The whole salon app (this site itself is its try-on on its own: tests/site.spec.ts, on 4174).
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      env: { VITE_SITE: "salon" },
      reuseExistingServer: !process.env.CI,
      timeout: 45_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 45_000,
    },
  ],
});

import { defineConfig, devices } from "playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  // Chromium/WebGPU timing on shared CI runners occasionally stalls a live camera frame;
  // retry a failed browser case once, keeping the failure visible if it persists.
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    // GitHub-hosted Ubuntu runners include Chrome; skip duplicate 300 MB browser installs.
    channel: process.env.CI ? "chrome" : undefined,
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 45_000,
  },
});

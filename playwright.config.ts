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
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 45_000,
    // (the salon chat's passcode on the test server: tests/chat.spec.ts signs in with it)
    env: { SALON_PASSCODE: "test-salon-passcode" },
  },
});

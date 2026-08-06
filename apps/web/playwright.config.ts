import { defineConfig, devices } from "@playwright/test";

const localBaseUrl = "http://localhost:3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseUrl;
const shouldStartLocalServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "line",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
  ],
  webServer: shouldStartLocalServer
    ? {
        command: "npm run start -- --hostname localhost --port 3100",
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        gracefulShutdown: { signal: "SIGTERM", timeout: 1_000 },
      }
    : undefined,
});

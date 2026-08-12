import { defineConfig, devices } from "@playwright/test";
import { config as loadEnvironment } from "dotenv";

import baseConfig from "./playwright.config";

loadEnvironment({ path: ".env.local", quiet: true });

const reviewerUserId =
  (process.env.CLERK_REVIEWER_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean) ??
  (process.env.CLERK_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean) ??
  "";

if (!reviewerUserId.startsWith("user_")) {
  throw new Error("A Clerk reviewer or admin user ID is required for reviewer E2E.");
}

process.env.CLERK_E2E_REVIEWER_USER_ID = reviewerUserId;

const reviewerBaseUrl = "http://localhost:3101";

export default defineConfig({
  ...baseConfig,
  testDir: "./e2e-admin",
  timeout: 60_000,
  use: {
    ...baseConfig.use,
    baseURL: reviewerBaseUrl,
  },
  projects: [
    {
      name: "clerk-setup",
      testMatch: /clerk\.setup\.ts/,
    },
    {
      name: "reviewer-desktop-chrome",
      testMatch: /reviewer-access\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      dependencies: ["clerk-setup"],
    },
  ],
  webServer: {
    command: "npm run start -- --hostname localhost --port 3101",
    url: reviewerBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 1_000 },
    env: {
      CLERK_ADMIN_USER_IDS: "",
      CLERK_REVIEWER_USER_IDS: reviewerUserId,
    },
  },
});

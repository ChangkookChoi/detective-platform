import { defineConfig, devices } from "@playwright/test";
import { config as loadEnvironment } from "dotenv";

import baseConfig from "./playwright.config";

loadEnvironment({ path: ".env.local", quiet: true });

export default defineConfig({
  ...baseConfig,
  testDir: "./e2e-admin",
  timeout: 60_000,
  projects: [
    {
      name: "clerk-setup",
      testMatch: /clerk\.setup\.ts/,
    },
    {
      name: "admin-desktop-chrome",
      testMatch: /admin-review-flow\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      dependencies: ["clerk-setup"],
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";
import { config as loadEnvironment } from "dotenv";

import baseConfig from "./playwright.config";

loadEnvironment({ path: ".env.local", quiet: true });

export default defineConfig({
  ...baseConfig,
  testDir: "./e2e-operations",
  timeout: 10 * 60_000,
  projects: [
    {
      name: "clerk-setup",
      testMatch: /clerk\.setup\.ts/,
    },
    {
      name: "office-batch-desktop-chrome",
      testMatch: /office-batch\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
      dependencies: ["clerk-setup"],
    },
  ],
});

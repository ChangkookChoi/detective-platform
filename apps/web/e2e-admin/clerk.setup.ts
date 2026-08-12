import { test as setup } from "@playwright/test";
import { clerkSetup } from "@clerk/testing/playwright";

setup.describe.configure({ mode: "serial" });

setup("Clerk testing token을 준비한다", async () => {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;

  if (!publishableKey || !secretKey) {
    throw new Error("Clerk development keys are required for admin E2E tests.");
  }

  await clerkSetup({
    publishableKey,
    secretKey,
    dotenv: false,
  });
});

import { createClerkClient } from "@clerk/backend";
import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

let reviewerEmailAddress = "";

test.beforeAll(async () => {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const reviewerUserId = process.env.CLERK_E2E_REVIEWER_USER_ID;

  if (!secretKey || !reviewerUserId?.startsWith("user_")) {
    throw new Error("Reviewer E2E environment configuration is incomplete.");
  }

  const clerkClient = createClerkClient({
    secretKey,
    telemetry: { disabled: true },
  });
  const reviewerUser = await clerkClient.users.getUser(reviewerUserId);
  const email =
    reviewerUser.emailAddresses.find(
      (item) => item.id === reviewerUser.primaryEmailAddressId,
    ) ?? reviewerUser.emailAddresses[0];

  if (!email) {
    throw new Error("The configured Clerk reviewer must have an email address.");
  }

  reviewerEmailAddress = email.emailAddress;
});

test.afterEach(async ({ page }) => {
  const hasActiveClerkUser = await page
    .evaluate(() => Boolean(window.Clerk?.user))
    .catch(() => false);

  if (hasActiveClerkUser) {
    await clerk.signOut({ page }).catch(() => undefined);
  }
});

test("실제 Clerk 사용자를 검수자 역할로 매핑해 검수 화면 접근을 허용한다", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: reviewerEmailAddress });

  const queueResponse = await page.goto("/admin/reviews", {
    waitUntil: "domcontentloaded",
  });
  expect(queueResponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "검수 대기열" }),
  ).toBeVisible();
  await expect(page.getByText("검수자", { exact: true })).toBeVisible();

  const candidateResponse = await page.goto("/admin/reviews/new", {
    waitUntil: "domcontentloaded",
  });
  expect(candidateResponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "신규 업체 후보 등록" }),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

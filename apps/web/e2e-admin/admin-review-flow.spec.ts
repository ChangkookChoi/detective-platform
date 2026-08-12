import { createClerkClient } from "@clerk/backend";
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const candidateName = "E2E 관리자 후보 탐정사무소";
const candidatePhone = "02-9876-5432";
const candidateAddress = "서울특별시 강남구 테헤란로 300";
const candidateSourceUrl = "https://example.com/e2e-admin-office";
const approvedOfficeSlug = "e2e-admin-approved-office";
const rejectionReason = "합성 관리자 E2E 후보이므로 공개하지 않고 반려합니다.";
const holdReason = "합성 관리자 E2E 후보의 보류 분기를 검증합니다.";
const approvalReason = "합성 관리자 E2E 후보의 승인 공개 분기를 검증합니다.";

let adminUserId = "";
let adminEmailAddress = "";
let database: Client | undefined;

function getDatabase() {
  if (!database) {
    throw new Error("The admin E2E database client is not initialized.");
  }

  return database;
}

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  return errors;
}

async function fillManualCandidateForm(page: Page, sourceUrl: string) {
  await page.locator('input[name="sourceUrl"]').fill(sourceUrl);
  await page.locator('input[name="name"]').fill(candidateName);
  await page.locator('input[name="phoneDisplay"]').fill(candidatePhone);
  await page.locator('textarea[name="addressText"]').fill(candidateAddress);
  await page.locator('input[name="officialSourceConfirmed"]').check();
  await page.locator('input[name="sensitiveContentConfirmed"]').check();
}

async function countOffices() {
  const result = await getDatabase().query<{ count: number }>(
    "select count(*)::integer as count from offices",
  );

  return result.rows[0]?.count ?? 0;
}

async function cleanupSyntheticReviewData() {
  const db = getDatabase();

  await db.query(
    `delete from review_actions
     where review_item_id in (
       select review_items.id
       from review_items
       join collected_records
         on collected_records.id = review_items.collected_record_id
       where collected_records.source_url = $1
     )`,
    [candidateSourceUrl],
  );
  await db.query(
    `delete from review_items
     where collected_record_id in (
       select id from collected_records where source_url = $1
     )`,
    [candidateSourceUrl],
  );
  await db.query(
    `delete from analytics_events
     where office_id in (
       select id from offices where slug = $1
     )`,
    [approvedOfficeSlug],
  );
  await db.query(
    `delete from office_daily_metrics
     where office_id in (
       select id from offices where slug = $1
     )`,
    [approvedOfficeSlug],
  );
  await db.query(
    `delete from placements
     where office_id in (
       select id from offices where slug = $1
     )`,
    [approvedOfficeSlug],
  );
  await db.query("delete from offices where slug = $1", [approvedOfficeSlug]);
  await db.query(
    `delete from collection_runs
     where id in (
       select collection_run_id
       from collected_records
       where source_url = $1
     )`,
    [candidateSourceUrl],
  );
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  const secretKey = process.env.CLERK_SECRET_KEY;
  adminUserId = (process.env.CLERK_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean) ?? "";

  if (!connectionString || !secretKey || !adminUserId.startsWith("user_")) {
    throw new Error("Admin E2E environment configuration is incomplete.");
  }

  const clerkClient = createClerkClient({
    secretKey,
    telemetry: { disabled: true },
  });
  const adminUser = await clerkClient.users.getUser(adminUserId);
  const email =
    adminUser.emailAddresses.find(
      (item) => item.id === adminUser.primaryEmailAddressId,
    ) ?? adminUser.emailAddresses[0];

  if (!email) {
    throw new Error("The configured Clerk admin must have an email address.");
  }

  adminEmailAddress = email.emailAddress;
  database = new Client({ connectionString });
  await database.connect();
});

test.beforeEach(async () => {
  await cleanupSyntheticReviewData();
});

test.afterEach(async ({ page }) => {
  const hasActiveClerkUser = await page
    .evaluate(() => Boolean(window.Clerk?.user))
    .catch(() => false);

  if (hasActiveClerkUser) {
    await clerk.signOut({ page }).catch(() => undefined);
  }
});

test.afterAll(async () => {
  if (database) {
    await cleanupSyntheticReviewData();
  }
  await database?.end();
  database = undefined;
  adminEmailAddress = "";
  adminUserId = "";
});

test("실제 Clerk 관리자가 수동 후보의 중복을 확인하고 반려한다", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  const officeCountBefore = await countOffices();

  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: adminEmailAddress });

  const adminResponse = await page.goto("/admin/reviews/new", {
    waitUntil: "domcontentloaded",
  });
  expect(adminResponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: "신규 업체 후보 등록" }),
  ).toBeVisible();
  await expect(page.getByText("관리자", { exact: true })).toBeVisible();

  await fillManualCandidateForm(page, `${candidateSourceUrl}#first`);
  await page.getByRole("button", { name: "검수 후보로 등록" }).click();
  await expect(page).toHaveURL(/\/admin\/reviews\/[0-9a-f-]+\?result=created$/);
  await expect(page.getByRole("status")).toContainText(
    "신규 업체 후보를 등록했습니다.",
  );

  const createdReviewItemId = new URL(page.url()).pathname.split("/").at(-1);
  expect(createdReviewItemId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  const createdReview = await getDatabase().query<{
    id: string;
    status: string;
    risk: string;
    cause: string;
    submitted_by_actor_id: string;
    office_id: string | null;
    source_url: string;
    proposed_values: Record<string, string>;
  }>(
    `select review_items.id, review_items.status, review_items.risk,
            review_items.cause, review_items.submitted_by_actor_id,
            review_items.office_id, collected_records.source_url,
            review_items.proposed_values
     from review_items
     join collected_records
       on collected_records.id = review_items.collected_record_id
     where review_items.id = $1`,
    [createdReviewItemId],
  );

  expect(createdReview.rows[0]).toEqual({
    id: createdReviewItemId,
    status: "pending",
    risk: "high",
    cause: "manual_official_source_candidate",
    submitted_by_actor_id: adminUserId,
    office_id: null,
    source_url: candidateSourceUrl,
    proposed_values: {
      name: candidateName,
      phoneDisplay: candidatePhone,
      phoneNormalized: "0298765432",
      addressText: candidateAddress,
    },
  });

  const provinceSelect = page.getByRole("combobox", {
    name: "시·도",
    exact: true,
  });
  const regionSelect = page.getByRole("combobox", {
    name: "시·군·구",
    exact: true,
  });
  await expect(regionSelect).toBeDisabled();
  await provinceSelect.selectOption("seoul");
  await expect(regionSelect).toBeEnabled();
  await expect(regionSelect.locator("option")).toHaveCount(26);
  await regionSelect.selectOption("seoul-gangnam");
  await expect(regionSelect).toHaveValue("seoul-gangnam");

  const sourceTypeGroup = page.getByRole("group", {
    name: "대표 출처 유형",
  });
  await expect(sourceTypeGroup).toBeVisible();
  await expect(
    sourceTypeGroup.getByRole("radio", { name: "공식 웹사이트" }),
  ).toBeChecked();
  await expect(sourceTypeGroup.getByRole("radio")).toHaveCount(5);

  expect(await countOffices()).toBe(officeCountBefore);

  await page.goto("/admin/reviews/new", { waitUntil: "domcontentloaded" });
  await fillManualCandidateForm(page, `${candidateSourceUrl}#duplicate`);
  await page.getByRole("button", { name: "검수 후보로 등록" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/reviews/${createdReviewItemId}\\?result=duplicate$`),
  );
  await expect(page.getByRole("status")).toContainText(
    "새 후보를 만들지 않았습니다.",
  );

  const candidateCount = await getDatabase().query<{ count: number }>(
    `select count(*)::integer as count
     from review_items
     join collected_records
       on collected_records.id = review_items.collected_record_id
     where collected_records.source_url = $1`,
    [candidateSourceUrl],
  );
  expect(candidateCount.rows[0]?.count).toBe(1);

  await page.getByLabel("반려 사유").fill(rejectionReason);
  await page.getByRole("button", { name: "반려", exact: true }).click();
  await expect(page).toHaveURL(
    /\/admin\/reviews\?status=rejected&result=rejected$/,
  );
  await expect(page.getByRole("status")).toContainText(
    "검수 결정이 저장되었습니다.",
  );

  const resolvedReview = await getDatabase().query<{
    status: string;
    resolved_at: Date | null;
    decision: string;
    actor_id: string;
    reason: string;
  }>(
    `select review_items.status, review_items.resolved_at,
            review_actions.decision, review_actions.actor_id,
            review_actions.reason
     from review_items
     join review_actions on review_actions.review_item_id = review_items.id
     where review_items.id = $1`,
    [createdReviewItemId],
  );

  expect(resolvedReview.rows[0]).toMatchObject({
    status: "rejected",
    decision: "rejected",
    actor_id: adminUserId,
    reason: rejectionReason,
  });
  expect(resolvedReview.rows[0]?.resolved_at).toBeInstanceOf(Date);

  expect(await countOffices()).toBe(officeCountBefore);

  await clerk.signOut({ page });
  const signedOutResponse = await page.request.get("/admin/reviews", {
    maxRedirects: 0,
  });
  expect(signedOutResponse.status()).toBe(307);
  expect(signedOutResponse.headers().location).toContain("/sign-in");
  expect(browserErrors).toEqual([]);
});

test("실제 Clerk 관리자가 수동 후보를 보류한다", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const officeCountBefore = await countOffices();

  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: adminEmailAddress });
  await page.goto("/admin/reviews/new", { waitUntil: "domcontentloaded" });
  await fillManualCandidateForm(page, `${candidateSourceUrl}#hold`);
  await page.getByRole("button", { name: "검수 후보로 등록" }).click();
  await expect(page).toHaveURL(/\/admin\/reviews\/[0-9a-f-]+\?result=created$/);

  const reviewItemId = new URL(page.url()).pathname.split("/").at(-1);
  expect(reviewItemId).toBeTruthy();
  await page.getByLabel("보류 사유").fill(holdReason);
  await page.getByRole("button", { name: "보류", exact: true }).click();
  await expect(page).toHaveURL(
    /\/admin\/reviews\?status=on_hold&result=on_hold$/,
  );
  await expect(page.getByRole("status")).toContainText(
    "검수 결정이 저장되었습니다.",
  );

  const heldReview = await getDatabase().query<{
    status: string;
    resolved_at: Date | null;
    decision: string;
    actor_id: string;
    reason: string;
  }>(
    `select review_items.status, review_items.resolved_at,
            review_actions.decision, review_actions.actor_id,
            review_actions.reason
     from review_items
     join review_actions on review_actions.review_item_id = review_items.id
     where review_items.id = $1`,
    [reviewItemId],
  );
  expect(heldReview.rows[0]).toEqual({
    status: "on_hold",
    resolved_at: null,
    decision: "on_hold",
    actor_id: adminUserId,
    reason: holdReason,
  });
  expect(await countOffices()).toBe(officeCountBefore);
  expect(browserErrors).toEqual([]);
});

test("실제 Clerk 관리자가 수동 후보를 승인하고 공개한다", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  const officeCountBefore = await countOffices();

  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: adminEmailAddress });
  await page.goto("/admin/reviews/new", { waitUntil: "domcontentloaded" });
  await fillManualCandidateForm(page, `${candidateSourceUrl}#approve`);
  await page.getByRole("button", { name: "검수 후보로 등록" }).click();
  await expect(page).toHaveURL(/\/admin\/reviews\/[0-9a-f-]+\?result=created$/);

  const reviewItemId = new URL(page.url()).pathname.split("/").at(-1);
  expect(reviewItemId).toBeTruthy();
  await page.getByLabel("공개 URL slug").fill(approvedOfficeSlug);
  await page.getByRole("combobox", { name: "시·도", exact: true }).selectOption("seoul");
  await page
    .getByRole("combobox", { name: "시·군·구", exact: true })
    .selectOption("seoul-gangnam");
  await page.getByLabel("가족 문제", { exact: true }).check();
  await page.getByLabel("승인 사유").fill(approvalReason);
  await page
    .getByRole("button", { name: "제안값 그대로 승인·공개" })
    .click();
  await expect(page).toHaveURL(
    /\/admin\/reviews\?status=approved&result=approved$/,
  );
  await expect(page.getByRole("status")).toContainText(
    "검수 결정이 저장되었습니다.",
  );

  const approvedReview = await getDatabase().query<{
    status: string;
    resolved_at: Date | null;
    decision: string;
    actor_id: string;
    reason: string;
    office_id: string;
  }>(
    `select review_items.status, review_items.resolved_at,
            review_items.office_id, review_actions.decision,
            review_actions.actor_id, review_actions.reason
     from review_items
     join review_actions on review_actions.review_item_id = review_items.id
     where review_items.id = $1`,
    [reviewItemId],
  );
  expect(approvedReview.rows[0]).toMatchObject({
    status: "approved",
    decision: "approved",
    actor_id: adminUserId,
    reason: approvalReason,
  });
  expect(approvedReview.rows[0]?.resolved_at).toBeInstanceOf(Date);

  const office = await getDatabase().query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    region_slug: string;
  }>(
    `select offices.id, offices.name, offices.slug, offices.status,
            regions.slug as region_slug
     from offices
     join regions on regions.id = offices.region_id
     where offices.slug = $1`,
    [approvedOfficeSlug],
  );
  expect(office.rows[0]).toMatchObject({
    name: candidateName,
    slug: approvedOfficeSlug,
    status: "published",
    region_slug: "seoul-gangnam",
  });
  expect(approvedReview.rows[0]?.office_id).toBe(office.rows[0]?.id);
  expect(await countOffices()).toBe(officeCountBefore + 1);

  const publicationEvidence = await getDatabase().query<{
    source_count: number;
    evidence_count: number;
  }>(
    `select
       count(distinct office_sources.id)::integer as source_count,
       count(office_source_evidence.id)::integer as evidence_count
     from office_sources
     left join office_source_evidence
       on office_source_evidence.office_source_id = office_sources.id
     where office_sources.office_id = $1
       and office_sources.url = $2
       and office_sources.is_primary = true`,
    [office.rows[0]?.id, candidateSourceUrl],
  );
  expect(publicationEvidence.rows[0]).toEqual({
    source_count: 1,
    evidence_count: 4,
  });

  const publicResponse = await page.goto(`/offices/${approvedOfficeSlug}`, {
    waitUntil: "domcontentloaded",
  });
  expect(publicResponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: candidateName }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `무료 전화 연결 · ${candidatePhone}` }),
  ).toHaveAttribute("href", "tel:0298765432");
  await expect(
    page.locator(`a[href="${candidateSourceUrl}"]`),
  ).toContainText("업체 공식 웹사이트");
  expect(browserErrors).toEqual([]);
});

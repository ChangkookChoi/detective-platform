import { createClerkClient } from "@clerk/backend";
import { clerk } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

type OfficeCandidate = {
  sourceUrl: string;
  name: string;
  phoneDisplay: string;
  addressText: string;
  slug: string;
  regionSlug: string;
  serviceCategorySlugs: string[];
  sourceType: string;
  evidenceNote: string;
};

type OfficeBatchManifest = {
  version: number;
  batchId: string;
  verifiedAt: string;
  candidates: OfficeCandidate[];
};

type PreflightResult = {
  sourceUrl: string;
  eligibleForManualIntake: boolean;
};

type OfficeBatchPreflight = {
  version: number;
  batchId: string;
  verifiedAt: string;
  checkedAt: string;
  results: PreflightResult[];
};

function requiredEnvironmentPath(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return resolve(value);
}

function readJson<T>(environmentName: string): T {
  const value = process.env[environmentName];
  if (!value) {
    throw new Error(`${environmentName} is required.`);
  }
  return JSON.parse(readFileSync(resolve(value), "utf8")) as T;
}

function loadAndValidateBatch() {
  const manifest = readJson<OfficeBatchManifest>("OFFICE_BATCH_MANIFEST");
  const preflight = readJson<OfficeBatchPreflight>("OFFICE_BATCH_PREFLIGHT");
  if (
    manifest.version !== 1 ||
    preflight.version !== 1 ||
    manifest.batchId !== preflight.batchId ||
    manifest.verifiedAt !== preflight.verifiedAt ||
    !Array.isArray(manifest.candidates) ||
    manifest.candidates.length === 0
  ) {
    throw new Error("Office batch manifest and preflight do not match.");
  }
  const checkedAt = new Date(preflight.checkedAt);
  const ageMilliseconds = Date.now() - checkedAt.getTime();
  if (
    Number.isNaN(checkedAt.getTime()) ||
    ageMilliseconds < -5 * 60_000 ||
    ageMilliseconds > 24 * 60 * 60_000
  ) {
    throw new Error("Office batch preflight must be less than 24 hours old.");
  }
  const resultBySource = new Map(
    preflight.results.map((result) => [result.sourceUrl, result]),
  );
  for (const candidate of manifest.candidates) {
    if (resultBySource.get(candidate.sourceUrl)?.eligibleForManualIntake !== true) {
      throw new Error(`Candidate did not pass preflight: ${candidate.sourceUrl}`);
    }
  }
  return manifest;
}

const manifest = loadAndValidateBatch();
let adminUserId = "";
let adminEmailAddress = "";
let database: Client | undefined;

function getDatabase() {
  if (!database) {
    throw new Error("Office batch database is not connected.");
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

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

async function findPublishedOffice(candidate: OfficeCandidate) {
  const result = await getDatabase().query<{
    id: string;
    slug: string;
    name: string;
    phone_display: string;
    address_text: string;
    source_url: string;
    category_slugs: string[];
  }>(
    `select offices.id, offices.slug, offices.name, offices.phone_display,
            offices.address_text, office_sources.url as source_url,
            coalesce(array_agg(distinct service_categories.slug)
              filter (where service_categories.slug is not null), '{}') as category_slugs
     from offices
     join office_sources on office_sources.office_id = offices.id
       and office_sources.is_primary = true
     left join office_service_categories
       on office_service_categories.office_id = offices.id
     left join service_categories
       on service_categories.id = office_service_categories.service_category_id
     where offices.slug = $1 and offices.status = 'published'
     group by offices.id, office_sources.url`,
    [candidate.slug],
  );
  return result.rows[0];
}

function expectExactPublishedValues(
  office: Awaited<ReturnType<typeof findPublishedOffice>>,
  candidate: OfficeCandidate,
) {
  expect(office).toBeTruthy();
  expect(office).toMatchObject({
    slug: candidate.slug,
    name: candidate.name,
    phone_display: candidate.phoneDisplay,
    address_text: candidate.addressText,
    source_url: candidate.sourceUrl,
  });
  expect(normalizePhone(office?.phone_display ?? "")).toBe(
    normalizePhone(candidate.phoneDisplay),
  );
  expect([...(office?.category_slugs ?? [])].sort()).toEqual(
    [...candidate.serviceCategorySlugs].sort(),
  );
}

async function verifyPublicPage(page: Page, candidate: OfficeCandidate) {
  const response = await page.goto(`/offices/${candidate.slug}`, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: candidate.name }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: `무료 전화 연결 · ${candidate.phoneDisplay}`,
    }),
  ).toHaveAttribute("href", `tel:${normalizePhone(candidate.phoneDisplay)}`);
  await expect(page.locator(`a[href="${candidate.sourceUrl}"]`)).toBeVisible();
}

async function registerAndApproveBatch(page: Page) {
  const unpublished = [];
  for (const candidate of manifest.candidates) {
    if (!(await findPublishedOffice(candidate))) {
      unpublished.push(candidate);
    }
  }

  await page.goto("/admin/reviews/batch", { waitUntil: "domcontentloaded" });
  await page
    .locator('input[name="manifest"]')
    .setInputFiles(requiredEnvironmentPath("OFFICE_BATCH_MANIFEST"));
  await page
    .locator('input[name="preflight"]')
    .setInputFiles(requiredEnvironmentPath("OFFICE_BATCH_PREFLIGHT"));
  await page.locator('input[name="officialSourceConfirmed"]').check();
  await page.locator('input[name="sensitiveContentConfirmed"]').check();
  await page.getByRole("button", { name: "검수 후보 일괄 등록" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/admin/reviews/batch\\?batchId=${encodeURIComponent(manifest.batchId)}&result=created`,
    ),
  );

  if (unpublished.length === 0) {
    await expect(page.getByText("승인 가능 0건")).toBeVisible();
    return;
  }

  for (const candidate of unpublished) {
    await expect(
      page.getByRole("checkbox", { name: `${candidate.name} 승인 선택` }),
    ).toBeChecked();
  }
  await page.locator('input[name="reviewedValuesConfirmed"]').check();
  await page
    .getByRole("button", { name: "선택한 정상 후보 일괄 승인·공개" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/admin/reviews/batch\\?batchId=${encodeURIComponent(manifest.batchId)}&result=(approved|partial)`,
    ),
  );
}

async function verifyAudit(candidate: OfficeCandidate) {
  const result = await getDatabase().query<{
    submitted_by_actor_id: string;
    actor_id: string;
    source_count: number;
    evidence_count: number;
  }>(
    `select review_items.submitted_by_actor_id, review_actions.actor_id,
            count(distinct office_sources.id)::integer as source_count,
            count(distinct office_source_evidence.id)::integer as evidence_count
     from offices
     join review_items on review_items.office_id = offices.id
     join review_actions on review_actions.review_item_id = review_items.id
       and review_actions.decision in ('approved', 'approved_with_edits')
     join office_sources on office_sources.office_id = offices.id
       and office_sources.is_primary = true
     left join office_source_evidence
       on office_source_evidence.office_source_id = office_sources.id
     where offices.slug = $1
     group by review_items.submitted_by_actor_id, review_actions.actor_id`,
    [candidate.slug],
  );
  expect(result.rows[0]).toEqual({
    submitted_by_actor_id: adminUserId,
    actor_id: adminUserId,
    source_count: 1,
    evidence_count: 3 + candidate.serviceCategorySlugs.length,
  });
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  const secretKey = process.env.CLERK_SECRET_KEY;
  adminUserId = (process.env.CLERK_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .find(Boolean) ?? "";
  if (!connectionString || !secretKey || !adminUserId.startsWith("user_")) {
    throw new Error("Office batch environment configuration is incomplete.");
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

test.afterAll(async () => {
  await database?.end();
  database = undefined;
});

test("검증된 공식 후보 묶음을 관리자 경계에서 등록·승인·공개한다", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await clerk.signIn({ page, emailAddress: adminEmailAddress });
  await registerAndApproveBatch(page);

  for (const candidate of manifest.candidates) {
    const published = await findPublishedOffice(candidate);
    expectExactPublishedValues(published, candidate);
    await verifyAudit(candidate);
    await verifyPublicPage(page, candidate);
  }

  expect(browserErrors).toEqual([]);
});

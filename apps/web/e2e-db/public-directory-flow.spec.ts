import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const officeId = "70000000-0000-4000-8000-000000000001";
const officeSourceId = "70000000-0000-4000-8000-000000000002";
const officeSlug = "e2e-public-office";
const officeName = "E2E 검증 탐정사무소";
const phoneDisplay = "02-1234-5678";
const phoneNormalized = "0212345678";
const currentAddress = "서울특별시 강남구 테헤란로 100";
const proposedAddress = "서울특별시 강남구 테헤란로 200";
const evidenceUrl = "https://example.com/e2e-office/address";

let database: Client | undefined;

function getDatabase() {
  if (!database) {
    throw new Error("The E2E database client is not initialized.");
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

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for database E2E tests.");
  }

  database = new Client({ connectionString });
  await database.connect();
  await database.query("begin");

  try {
    const region = await database.query<{ id: string }>(
      "select id from regions where slug = $1 and is_active = true",
      ["seoul-gangnam"],
    );
    const category = await database.query<{ id: string }>(
      "select id from service_categories where slug = $1 and is_active = true",
      ["family"],
    );

    if (!region.rows[0] || !category.rows[0]) {
      throw new Error("The seeded Gangnam region and family category are required.");
    }

    await database.query(
      `insert into offices (
         id, slug, name, summary, phone_normalized, phone_display,
         address_text, region_id, status, published_at, last_verified_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'published', $9, $9)`,
      [
        officeId,
        officeSlug,
        officeName,
        "공개 사용자 흐름을 검증하기 위한 합성 업체입니다.",
        phoneNormalized,
        phoneDisplay,
        currentAddress,
        region.rows[0].id,
        new Date("2026-08-01T00:00:00.000Z"),
      ],
    );
    await database.query(
      `insert into office_service_categories (office_id, service_category_id)
       values ($1, $2)`,
      [officeId, category.rows[0].id],
    );
    await database.query(
      `insert into office_sources (
         id, office_id, source_type, url, retrieved_at, verified_at,
         is_primary, access_status
       ) values ($1, $2, 'official_website', $3, $4, $4, true, 'available')`,
      [
        officeSourceId,
        officeId,
        "https://example.com/e2e-office",
        new Date("2026-08-01T00:00:00.000Z"),
      ],
    );
    await database.query(
      `insert into office_source_evidence (
         office_source_id, field_name, service_category_id, verified_at
       ) values
         ($1, 'name', null, $3),
         ($1, 'phone', null, $3),
         ($1, 'address', null, $3),
         ($1, 'summary', null, $3),
         ($1, 'service_category', $2, $3)`,
      [
        officeSourceId,
        category.rows[0].id,
        new Date("2026-08-01T00:00:00.000Z"),
      ],
    );
    await database.query("commit");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
});

test.beforeEach(async () => {
  const db = getDatabase();

  await db.query("delete from review_items where office_id = $1", [officeId]);
  await db.query("delete from analytics_events where office_id = $1", [officeId]);
  await db.query("delete from office_daily_metrics where office_id = $1", [officeId]);
});

test.afterAll(async () => {
  await database?.end();
  database = undefined;
});

test("필터 탐색부터 분석 집계와 정정 검수 후보 저장까지 이어진다", async ({
  page,
}) => {
  const browserErrors = collectBrowserErrors(page);

  const listResponse = await page.goto("/offices", {
    waitUntil: "domcontentloaded",
  });
  expect(listResponse?.status()).toBe(200);

  await page.getByLabel("소재 지역").selectOption("seoul-gangnam");
  await page.getByLabel("업무 분야").selectOption("family");
  await Promise.all([
    page.waitForURL(/\/offices\?region=seoul-gangnam&category=family$/),
    page.getByRole("button", { name: "조건 적용" }).click(),
  ]);

  await expect(page.getByRole("heading", { name: "1개 업체" })).toBeVisible();
  await expect(page.getByRole("link", { name: officeName })).toBeVisible();

  const detailEvent = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/analytics/events") &&
      response.request().method() === "POST",
  );
  await page.getByRole("link", { name: officeName }).click();
  const detailEventResponse = await detailEvent;

  expect(detailEventResponse.status()).toBe(204);
  await expect(page).toHaveURL(new RegExp(`/offices/${officeSlug}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: officeName }),
  ).toBeVisible();
  await expect(page.getByText(currentAddress, { exact: true })).toBeVisible();
  await expect(page.locator('a[href="https://example.com/e2e-office"]')).toBeVisible();

  await expect
    .poll(async () => {
      const result = await getDatabase().query<{
        detail_view_count: number;
        phone_click_count: number;
      }>(
        `select detail_view_count, phone_click_count
         from office_daily_metrics where office_id = $1`,
        [officeId],
      );

      return result.rows[0];
    })
    .toEqual({ detail_view_count: 1, phone_click_count: 0 });

  const phoneLink = page.locator(`a[href="tel:${phoneNormalized}"]`);
  await phoneLink.evaluate((element) => {
    element.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
  });
  const phoneEvent = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/analytics/events") &&
      response.request().method() === "POST",
  );
  await phoneLink.click();
  const phoneEventResponse = await phoneEvent;

  expect(phoneEventResponse.status()).toBe(204);
  await expect
    .poll(async () => {
      const result = await getDatabase().query<{
        detail_view_count: number;
        phone_click_count: number;
      }>(
        `select detail_view_count, phone_click_count
         from office_daily_metrics where office_id = $1`,
        [officeId],
      );

      return result.rows[0];
    })
    .toEqual({ detail_view_count: 1, phone_click_count: 1 });

  await page.getByRole("link", { name: "정보 수정 요청" }).click();
  await expect(page).toHaveURL(new RegExp(`/offices/${officeSlug}/correction$`));
  await page.getByLabel("수정할 항목").selectOption("address");
  await page.getByLabel("올바른 공개 정보").fill(proposedAddress);
  await page.getByLabel("공개 근거 URL (선택)").fill(evidenceUrl);
  await page.getByLabel("요청자 관계").selectOption("public_user");
  await page
    .getByLabel(/민감정보를 포함하지 않았음을 확인합니다/)
    .check();
  await page.getByRole("button", { name: "수정 요청 접수" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/offices/${officeSlug}/correction\\?result=submitted$`),
  );
  await expect(page.getByRole("status")).toContainText(
    "수정 요청을 접수했습니다.",
  );

  await expect
    .poll(async () => {
      const result = await getDatabase().query<{
        status: string;
        risk: string;
        cause: string;
        proposed_values: Record<string, string>;
      }>(
        `select status, risk, cause, proposed_values
         from review_items
         where office_id = $1 and type = 'correction_request'`,
        [officeId],
      );

      return result.rows[0];
    })
    .toEqual({
      status: "pending",
      risk: "high",
      cause: "public_correction_request",
      proposed_values: {
        addressText: proposedAddress,
        requestedField: "address",
        requesterRole: "public_user",
        evidenceUrl,
      },
    });

  const unchangedOffice = await getDatabase().query<{ address_text: string }>(
    "select address_text from offices where id = $1",
    [officeId],
  );
  expect(unchangedOffice.rows[0]?.address_text).toBe(currentAddress);
  expect(browserErrors).toEqual([]);
});

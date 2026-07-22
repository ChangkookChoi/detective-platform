import assert from "node:assert/strict";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";

import { closeDatabase, getDatabase } from "../src/db";
import {
  officeServiceCategories,
  officeSourceEvidence,
  officeSources,
  offices,
  regions,
  reviewActions,
  reviewItems,
  serviceCategories,
} from "../src/db/schema";
import {
  getPublicOfficeBySlug,
  listPublicDirectoryFilterOptions,
  listPublicOffices,
  PublicDirectoryFilterError,
} from "../src/modules/directory/public-office-repository";
import {
  OfficePublicationError,
  publishOffice,
} from "../src/modules/moderation/publish-office";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const validOfficeId = "20000000-0000-4000-8000-000000000001";
const invalidOfficeId = "20000000-0000-4000-8000-000000000002";
const validReviewId = "30000000-0000-4000-8000-000000000001";
const invalidReviewId = "30000000-0000-4000-8000-000000000002";
const validSourceId = "40000000-0000-4000-8000-000000000001";
const invalidSourceId = "40000000-0000-4000-8000-000000000002";
const officeIds = [validOfficeId, invalidOfficeId];
const reviewIds = [validReviewId, invalidReviewId];

function isPublicationError(error: unknown, reason: string) {
  return error instanceof OfficePublicationError && error.reason === reason;
}

async function cleanup() {
  const db = getDatabase();

  await db.delete(reviewActions).where(inArray(reviewActions.reviewItemId, reviewIds));
  await db.delete(reviewItems).where(inArray(reviewItems.id, reviewIds));
  await db.delete(offices).where(inArray(offices.id, officeIds));
}

async function main() {
  const db = getDatabase();

  try {
    await cleanup();

    const [region] = await db
      .select({ id: regions.id })
      .from(regions)
      .where(eq(regions.slug, "gyeonggi-suwon-paldal"))
      .limit(1);
    const [category] = await db
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(eq(serviceCategories.slug, "family"))
      .limit(1);

    assert(region, "Paldal region seed is required");
    assert(category, "Family category seed is required");

    const now = new Date();
    const [validOffice] = await db
      .insert(offices)
      .values({
        id: validOfficeId,
        slug: "sample-publication-office",
        name: "가상 검증 사무소",
        summary: "통합 검증을 위한 공개되지 않는 합성 데이터",
        phoneNormalized: "0310000000",
        phoneDisplay: "031-000-0000",
        addressText: "경기도 수원시 팔달구 가상로 1",
        regionId: region.id,
        status: "draft",
        lastVerifiedAt: now,
        updatedAt: now,
      })
      .returning({ updatedAt: offices.updatedAt });

    assert(validOffice);

    const [invalidOffice] = await db
      .insert(offices)
      .values({
        id: invalidOfficeId,
        slug: "sample-invalid-publication-office",
        name: "가상 근거 누락 사무소",
        phoneNormalized: "0310000001",
        phoneDisplay: "031-000-0001",
        addressText: "경기도 수원시 팔달구 가상로 2",
        regionId: region.id,
        status: "draft",
        lastVerifiedAt: now,
        updatedAt: now,
      })
      .returning({ updatedAt: offices.updatedAt });

    assert(invalidOffice);

    await db.insert(officeServiceCategories).values([
      { officeId: validOfficeId, serviceCategoryId: category.id },
      { officeId: invalidOfficeId, serviceCategoryId: category.id },
    ]);

    await db.insert(officeSources).values([
      {
        id: validSourceId,
        officeId: validOfficeId,
        sourceType: "official_website",
        url: "https://example.invalid/valid-office",
        verifiedAt: now,
        isPrimary: true,
      },
      {
        id: invalidSourceId,
        officeId: invalidOfficeId,
        sourceType: "official_website",
        url: "https://example.invalid/invalid-office",
        verifiedAt: now,
        isPrimary: true,
      },
    ]);
    await db.insert(officeSourceEvidence).values([
      {
        officeSourceId: validSourceId,
        fieldName: "name",
        verifiedAt: now,
      },
      {
        officeSourceId: validSourceId,
        fieldName: "phone",
        verifiedAt: now,
      },
      {
        officeSourceId: validSourceId,
        fieldName: "address",
        verifiedAt: now,
      },
      {
        officeSourceId: validSourceId,
        fieldName: "service_category",
        serviceCategoryId: category.id,
        verifiedAt: now,
      },
    ]);
    await db.insert(reviewItems).values([
      {
        id: validReviewId,
        officeId: validOfficeId,
        type: "new_office",
        risk: "high",
        proposedValues: { status: "published" },
        cause: "synthetic_integration_verification",
      },
      {
        id: invalidReviewId,
        officeId: invalidOfficeId,
        type: "new_office",
        risk: "high",
        proposedValues: { status: "published" },
        cause: "synthetic_integration_verification",
      },
    ]);

    assert.equal(
      await getPublicOfficeBySlug("sample-publication-office"),
      null,
      "Draft office must not be public",
    );

    await assert.rejects(
      db
        .update(officeSources)
        .set({ url: "javascript:alert(1)" })
        .where(eq(officeSources.id, invalidSourceId))
        .then(() =>
          publishOffice({
            officeId: invalidOfficeId,
            reviewItemId: invalidReviewId,
            actorId: "synthetic-reviewer",
            reason: "출처 URL 검증",
            expectedUpdatedAt: invalidOffice.updatedAt,
          }),
        ),
      (error: unknown) => isPublicationError(error, "invalid_source_url"),
    );
    await db
      .update(officeSources)
      .set({ url: "https://example.invalid/invalid-office" })
      .where(eq(officeSources.id, invalidSourceId));

    await assert.rejects(
      publishOffice({
        officeId: invalidOfficeId,
        reviewItemId: invalidReviewId,
        actorId: "synthetic-reviewer",
        reason: "근거 누락 검증",
        expectedUpdatedAt: invalidOffice.updatedAt,
      }),
      (error: unknown) => isPublicationError(error, "missing_evidence"),
    );

    const published = await publishOffice({
      officeId: validOfficeId,
      reviewItemId: validReviewId,
      actorId: "synthetic-reviewer",
      reason: "합성 데이터 공개 전환 검증",
      expectedUpdatedAt: validOffice.updatedAt,
    });
    assert.equal(published.status, "published");

    const list = await listPublicOffices({
      region: "gyeonggi",
      category: "family",
    });
    assert.deepEqual(list.map((office) => office.id), [validOfficeId]);
    assert.equal((await listPublicOffices({ region: "seoul" })).length, 0);

    const filterOptions = await listPublicDirectoryFilterOptions();
    assert.equal(
      filterOptions.regions.find(
        (option) => option.slug === "gyeonggi-suwon-paldal",
      )?.label,
      "경기도 / 수원시 / 팔달구",
    );
    assert(filterOptions.categories.some((option) => option.slug === "family"));

    const detail = await getPublicOfficeBySlug("sample-publication-office");
    assert(detail);
    assert.equal(detail.phoneDisplay, "031-000-0000");
    assert.deepEqual(detail.categories.map((item) => item.slug), ["family"]);
    assert.equal(detail.sources.length, 1);

    await assert.rejects(
      listPublicOffices({ region: "unsupported-region" }),
      (error: unknown) =>
        error instanceof PublicDirectoryFilterError && error.field === "region",
    );
    await assert.rejects(
      publishOffice({
        officeId: validOfficeId,
        reviewItemId: validReviewId,
        actorId: "synthetic-reviewer",
        reason: "동시성 검증",
        expectedUpdatedAt: validOffice.updatedAt,
      }),
      (error: unknown) => isPublicationError(error, "concurrent_change"),
    );

    await assert.rejects(
      db.insert(offices).values({
        slug: "sample-invalid-published-office",
        name: "가상 필수값 누락 사무소",
        regionId: region.id,
        status: "published",
      }),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "cause" in error &&
        typeof error.cause === "object" &&
        error.cause !== null &&
        "code" in error.cause &&
        error.cause.code === "23514",
    );

    console.log("Publication and public directory verification completed.");
  } finally {
    await cleanup();
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Publication verification failed.",
  );
  process.exitCode = 1;
});

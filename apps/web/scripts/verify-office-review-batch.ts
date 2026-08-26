import assert from "node:assert/strict";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";

import { closeDatabase, getDatabase } from "../src/db";
import {
  collectedRecords,
  collectionRuns,
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
  approveOfficeReviewBatch,
  createOfficeReviewBatch,
  listOfficeReviewBatch,
  OfficeReviewBatchError,
  parseOfficeReviewBatch,
} from "../src/modules/moderation/office-review-batch";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const actorId = "user_office_batch_verifier";
const batchId = "2099-01-01-batch-verifier";
const now = new Date();
const candidates = [
  {
    sourceUrl: "https://batch.example.invalid/one",
    name: "배치 검증 탐정사무소 하나",
    phoneDisplay: "02-111-2222",
    addressText: "서울특별시 강남구 배치로 1",
    slug: "batch-verifier-one",
    regionSlug: "seoul-gangnam",
    serviceCategorySlugs: ["family", "evidence-fact-checking"],
    sourceType: "official_website",
    evidenceNote: "공식 연락처 영역과 업무 안내에서 최소 사실 필드를 확인했습니다.",
  },
  {
    sourceUrl: "https://batch.example.invalid/two",
    name: "배치 검증 탐정사무소 둘",
    phoneDisplay: "031-333-4444",
    addressText: "경기도 수원시 영통구 배치로 2",
    slug: "batch-verifier-two",
    regionSlug: "gyeonggi-suwon-yeongtong",
    serviceCategorySlugs: ["personal-safety"],
    sourceType: "official_website",
    evidenceNote: "공식 하단 정보와 업무 안내에서 최소 사실 필드를 확인했습니다.",
  },
  {
    sourceUrl: "https://batch.example.invalid/three",
    name: "배치 검증 탐정사무소 셋",
    phoneDisplay: "031-555-6666",
    addressText: "경기도 수원시 영통구 배치로 3",
    slug: "batch-verifier-three",
    regionSlug: "gyeonggi-suwon-yeongtong",
    serviceCategorySlugs: ["people-search"],
    sourceType: "official_website",
    evidenceNote: "공식 연락처와 서비스 안내에서 최소 사실 필드를 확인했습니다.",
  },
];

const manifestText = JSON.stringify({
  version: 1,
  batchId,
  verifiedAt: "2099-01-01",
  candidates,
});
const preflightText = JSON.stringify({
  version: 1,
  batchId,
  verifiedAt: "2099-01-01",
  checkedAt: now.toISOString(),
  results: candidates.map((candidate) => ({
    sourceUrl: candidate.sourceUrl,
    eligibleForManualIntake: true,
  })),
});

async function cleanup() {
  const db = getDatabase();
  const officeRows = await db
    .select({ id: offices.id })
    .from(offices)
    .where(inArray(offices.slug, candidates.map((item) => item.slug)));
  const officeIds = officeRows.map((item) => item.id);
  if (officeIds.length > 0) {
    const sourceRows = await db
      .select({ id: officeSources.id })
      .from(officeSources)
      .where(inArray(officeSources.officeId, officeIds));
    const sourceIds = sourceRows.map((item) => item.id);
    if (sourceIds.length > 0) {
      await db
        .delete(officeSourceEvidence)
        .where(inArray(officeSourceEvidence.officeSourceId, sourceIds));
    }
    await db.delete(officeSources).where(inArray(officeSources.officeId, officeIds));
    await db
      .delete(officeServiceCategories)
      .where(inArray(officeServiceCategories.officeId, officeIds));
  }

  const records = await db
    .select({ id: collectedRecords.id, runId: collectedRecords.collectionRunId })
    .from(collectedRecords)
    .where(inArray(collectedRecords.sourceUrl, candidates.map((item) => item.sourceUrl)));
  const recordIds = records.map((item) => item.id);
  if (recordIds.length > 0) {
    const reviews = await db
      .select({ id: reviewItems.id })
      .from(reviewItems)
      .where(inArray(reviewItems.collectedRecordId, recordIds));
    const reviewIds = reviews.map((item) => item.id);
    if (reviewIds.length > 0) {
      await db.delete(reviewActions).where(inArray(reviewActions.reviewItemId, reviewIds));
      await db.delete(reviewItems).where(inArray(reviewItems.id, reviewIds));
    }
    await db.delete(collectedRecords).where(inArray(collectedRecords.id, recordIds));
    await db
      .delete(collectionRuns)
      .where(inArray(collectionRuns.id, records.map((item) => item.runId)));
  }
  if (officeIds.length > 0) {
    await db.delete(offices).where(inArray(offices.id, officeIds));
  }
}

function batchError(error: unknown, reason: string) {
  return error instanceof OfficeReviewBatchError && error.reason === reason;
}

async function main() {
  const db = getDatabase();
  try {
    await cleanup();
    assert.equal(parseOfficeReviewBatch(manifestText, preflightText, now).candidates.length, 3);
    assert.throws(
      () =>
        parseOfficeReviewBatch(
          manifestText,
          JSON.stringify({
            version: 1,
            batchId,
            verifiedAt: "2099-01-01",
            checkedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString(),
            results: [],
          }),
          now,
        ),
      (error: unknown) => batchError(error, "preflight_expired"),
    );
    await assert.rejects(
      createOfficeReviewBatch({
        actorId,
        manifestText,
        preflightText,
        officialSourceConfirmed: false,
        sensitiveContentConfirmed: true,
      }),
      (error: unknown) => batchError(error, "confirmation_required"),
    );

    const officeCountBefore = await db.select({ id: offices.id }).from(offices);
    const created = await createOfficeReviewBatch({
      actorId,
      manifestText,
      preflightText,
      officialSourceConfirmed: true,
      sensitiveContentConfirmed: true,
    });
    assert.deepEqual(created.results.map((item) => item.outcome), ["created", "created", "created"]);
    const rows = await listOfficeReviewBatch(batchId);
    assert.equal(rows.length, 3);
    assert(rows.every((row) => row.status === "pending"));
    assert.deepEqual(rows[0]?.metadata.serviceCategorySlugs, [
      "evidence-fact-checking",
      "family",
    ]);
    const officeCountAfterIntake = await db.select({ id: offices.id }).from(offices);
    assert.equal(officeCountAfterIntake.length, officeCountBefore.length);

    const resumed = await createOfficeReviewBatch({
      actorId,
      manifestText,
      preflightText,
      officialSourceConfirmed: true,
      sensitiveContentConfirmed: true,
    });
    assert.deepEqual(resumed.results.map((item) => item.outcome), ["existing", "existing", "existing"]);

    const [conflictRegion] = await db
      .select({ id: regions.id })
      .from(regions)
      .where(eq(regions.slug, "gyeonggi-suwon-yeongtong"))
      .limit(1);
    const regionId = conflictRegion?.id;
    assert(regionId);
    await db.insert(offices).values({
      slug: candidates[2]!.slug,
      name: "배치 충돌 검증용 draft",
      regionId,
      status: "draft",
    });

    await assert.rejects(
      approveOfficeReviewBatch({
        batchId,
        reviewItemIds: rows.map((row) => row.id),
        actorId,
        reason: "검증 배치 승인 사유입니다.",
        reviewedValuesConfirmed: false,
      }),
      (error: unknown) => batchError(error, "confirmation_required"),
    );
    const approved = await approveOfficeReviewBatch({
      batchId,
      reviewItemIds: rows.map((row) => row.id),
      actorId,
      reason: "검증 배치의 공식 출처와 행별 제안값을 모두 대조했습니다.",
      reviewedValuesConfirmed: true,
    });
    assert.equal(approved.approved.length, 2);
    assert.deepEqual(approved.failed, [
      { reviewItemId: rows[2]!.id, reason: "slug_conflict" },
    ]);

    const published = await db
      .select({
        slug: offices.slug,
        status: offices.status,
        sourceUrl: officeSources.url,
      })
      .from(offices)
      .innerJoin(
        officeSources,
        eq(officeSources.officeId, offices.id),
      )
      .where(inArray(offices.slug, candidates.map((item) => item.slug)));
    assert.equal(published.length, 2);
    assert(published.every((item) => item.status === "published"));
    const officeStatuses = await db
      .select({ status: offices.status })
      .from(offices)
      .where(inArray(offices.slug, candidates.map((item) => item.slug)));
    assert.equal(officeStatuses.filter((item) => item.status === "published").length, 2);
    assert.equal(officeStatuses.filter((item) => item.status === "draft").length, 1);

    const afterPartial = await listOfficeReviewBatch(batchId);
    assert.equal(afterPartial.filter((item) => item.status === "approved").length, 2);
    assert.equal(afterPartial.filter((item) => item.status === "pending").length, 1);

    const actionRows = await db
      .select({ actorId: reviewActions.actorId, decision: reviewActions.decision })
      .from(reviewActions)
      .where(inArray(reviewActions.reviewItemId, rows.map((row) => row.id)));
    assert.equal(actionRows.length, 2);
    assert(actionRows.every((item) => item.actorId === actorId && item.decision === "approved"));

    const categories = await db
      .select({ officeId: officeServiceCategories.officeId, slug: serviceCategories.slug })
      .from(officeServiceCategories)
      .innerJoin(serviceCategories, eq(serviceCategories.id, officeServiceCategories.serviceCategoryId))
      .where(inArray(serviceCategories.slug, ["family", "evidence-fact-checking", "personal-safety"]));
    assert(categories.length >= 3);
    console.log("Office review batch verification completed.");
  } finally {
    await cleanup();
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Office review batch verification failed.");
  process.exitCode = 1;
});

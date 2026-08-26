import assert from "node:assert/strict";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";

import { closeDatabase, getDatabase } from "../src/db";
import {
  collectedRecords,
  collectionRuns,
  officeEmailMarketingConsents,
  officeServiceCategories,
  officeSourceEvidence,
  officeSources,
  offices,
  regions,
  reviewActions,
  reviewItems,
  serviceCategories,
} from "../src/db/schema";
import { resolveStaffRole } from "../src/modules/auth/admin-roles";
import {
  approveReview,
  ReviewApprovalError,
} from "../src/modules/moderation/approve-review";
import {
  getPublicOfficeBySlug,
  listPublicDirectoryFilterOptions,
  listPublicOffices,
  PublicDirectoryFilterError,
} from "../src/modules/directory/public-office-repository";
import {
  getReviewItem,
  listReviewQueue,
  listReviewFormOptions,
  ReviewQueueFilterError,
} from "../src/modules/moderation/review-repository";
import {
  resolveReview,
  ReviewResolutionError,
} from "../src/modules/moderation/resolve-review";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const validOfficeId = "20000000-0000-4000-8000-000000000001";
const invalidOfficeId = "20000000-0000-4000-8000-000000000002";
const validReviewId = "30000000-0000-4000-8000-000000000001";
const invalidReviewId = "30000000-0000-4000-8000-000000000002";
const newReviewId = "30000000-0000-4000-8000-000000000003";
const rollbackReviewId = "30000000-0000-4000-8000-000000000004";
const duplicateSourceReviewId = "30000000-0000-4000-8000-000000000005";
const validSourceId = "40000000-0000-4000-8000-000000000001";
const invalidSourceId = "40000000-0000-4000-8000-000000000002";
const collectionRunId = "50000000-0000-4000-8000-000000000001";
const validRecordId = "60000000-0000-4000-8000-000000000001";
const invalidRecordId = "60000000-0000-4000-8000-000000000002";
const newRecordId = "60000000-0000-4000-8000-000000000003";
const rollbackRecordId = "60000000-0000-4000-8000-000000000004";
const duplicateSourceRecordId = "60000000-0000-4000-8000-000000000005";
const reviewIds = [
  validReviewId,
  invalidReviewId,
  newReviewId,
  rollbackReviewId,
  duplicateSourceReviewId,
];
const fixedOfficeIds = [validOfficeId, invalidOfficeId];
const syntheticSlugs = [
  "sample-publication-office",
  "sample-invalid-publication-office",
  "sample-collected-office",
  "sample-rollback-office",
  "sample-duplicate-source-office",
];

function isApprovalError(error: unknown, reason: string) {
  return error instanceof ReviewApprovalError && error.reason === reason;
}

async function cleanup() {
  const db = getDatabase();

  await db
    .delete(reviewActions)
    .where(inArray(reviewActions.reviewItemId, reviewIds));
  await db.delete(reviewItems).where(inArray(reviewItems.id, reviewIds));
  await db.delete(offices).where(inArray(offices.id, fixedOfficeIds));
  await db.delete(offices).where(inArray(offices.slug, syntheticSlugs));
  await db
    .delete(collectionRuns)
    .where(eq(collectionRuns.id, collectionRunId));
}

async function main() {
  const db = getDatabase();

  try {
    await cleanup();

    assert.equal(
      resolveStaffRole("user-admin", {
        adminUserIds: "user-admin",
        reviewerUserIds: "user-reviewer,user-admin",
      }),
      "admin",
    );
    assert.equal(
      resolveStaffRole("user-reviewer", {
        adminUserIds: "user-admin",
        reviewerUserIds: " user-reviewer ",
      }),
      "reviewer",
    );
    assert.equal(
      resolveStaffRole("user-unknown", {
        adminUserIds: "user-admin",
        reviewerUserIds: "user-reviewer",
      }),
      null,
    );

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

    const formOptions = await listReviewFormOptions();
    const gyeonggiGroup = formOptions.regionGroups.find(
      (group) => group.slug === "gyeonggi",
    );
    const seoulGroup = formOptions.regionGroups.find(
      (group) => group.slug === "seoul",
    );
    assert(gyeonggiGroup, "Gyeonggi region group is required");
    assert(seoulGroup, "Seoul region group is required");
    assert(
      gyeonggiGroup.regions.some(
        (option) => option.slug === "gyeonggi-suwon-paldal",
      ),
    );
    assert(
      gyeonggiGroup.regions.some(
        (option) =>
          option.slug === "gyeonggi-suwon-paldal" &&
          option.label === "수원시 / 팔달구",
      ),
    );
    assert(
      seoulGroup.regions.some(
        (option) =>
          option.slug === "seoul-gangbuk" && option.label === "강북구",
      ),
    );
    assert(
      !gyeonggiGroup.regions.some((option) => option.slug === "gyeonggi"),
    );
    assert(formOptions.categories.some((option) => option.slug === "family"));

    const now = new Date();
    const [validOffice] = await db
      .insert(offices)
      .values({
        id: validOfficeId,
        slug: "sample-publication-office",
        name: "가상 검증 사무소",
        summary: "기존 합성 소개",
        phoneNormalized: "0310000000",
        phoneDisplay: "031-000-0000",
        addressText: "경기도 수원시 팔달구 가상로 1",
        regionId: region.id,
        status: "draft",
        lastVerifiedAt: now,
        updatedAt: now,
      })
      .returning({ updatedAt: offices.updatedAt });
    const [invalidOffice] = await db
      .insert(offices)
      .values({
        id: invalidOfficeId,
        slug: "sample-invalid-publication-office",
        name: "가상 근거 누락 사무소",
        summary: "기존 합성 소개",
        phoneNormalized: "0310000001",
        phoneDisplay: "031-000-0001",
        addressText: "경기도 수원시 팔달구 가상로 2",
        regionId: region.id,
        status: "draft",
        lastVerifiedAt: now,
        updatedAt: now,
      })
      .returning({ updatedAt: offices.updatedAt });

    assert(validOffice);
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
      { officeSourceId: validSourceId, fieldName: "name", verifiedAt: now },
      { officeSourceId: validSourceId, fieldName: "phone", verifiedAt: now },
      { officeSourceId: validSourceId, fieldName: "address", verifiedAt: now },
      {
        officeSourceId: validSourceId,
        fieldName: "service_category",
        serviceCategoryId: category.id,
        verifiedAt: now,
      },
    ]);

    await db.insert(collectionRuns).values({
      id: collectionRunId,
      sourceName: "synthetic-publication-source",
      adapterName: "jsonld_local_business",
      extractorVersion: "integration-v1",
      status: "succeeded",
      finishedAt: now,
      discoveredCount: 5,
      collectedCount: 5,
    });
    await db.insert(collectedRecords).values([
      {
        id: validRecordId,
        collectionRunId,
        sourceUrl: "https://example.invalid/valid-office",
        sourceRecordKey: "valid-office",
        extractedValues: { description: "수집 제안 소개" },
        normalizedValues: {
          name: "가상 검증 사무소",
          phoneNormalized: "0310000000",
          phoneDisplay: "031-000-0000",
          addressText: "경기도 수원시 팔달구 가상로 1",
          summary: "수집 제안 소개",
        },
        contentHash: "valid-record-hash",
      },
      {
        id: invalidRecordId,
        collectionRunId,
        sourceUrl: "https://example.invalid/invalid-office",
        sourceRecordKey: "invalid-office",
        extractedValues: { description: "근거 누락 제안" },
        normalizedValues: {
          name: "가상 근거 누락 사무소",
          phoneNormalized: "0310000001",
          phoneDisplay: "031-000-0001",
          addressText: "경기도 수원시 팔달구 가상로 2",
          summary: "근거 누락 제안",
        },
        contentHash: "invalid-record-hash",
      },
      {
        id: newRecordId,
        collectionRunId,
        sourceUrl: "https://example.invalid/new-office",
        sourceRecordKey: "new-office",
        extractedValues: {
          name: "신규 수집 사무소",
          telephone: "1800-6624",
          address: "경기도 수원시 팔달구 신규로 3",
        },
        normalizedValues: {
          name: "신규 수집 사무소",
          phoneNormalized: "18006624",
          phoneDisplay: "1800-6624",
          emailNormalized: "contact@example.invalid",
          emailDisplay: "contact@example.invalid",
          emailKind: "generic_business",
          addressText: "경기도 수원시 팔달구 신규로 3",
          summary: "신규 수집 소개",
        },
        contentHash: "new-record-hash",
      },
      {
        id: rollbackRecordId,
        collectionRunId,
        sourceUrl: "https://example.invalid/new-office",
        sourceRecordKey: "rollback-office",
        extractedValues: { name: "롤백 검증 사무소" },
        normalizedValues: {
          name: "롤백 검증 사무소",
          phoneNormalized: "0313334444",
          phoneDisplay: "031-333-4444",
          addressText: "경기도 수원시 팔달구 롤백로 4",
        },
        contentHash: "rollback-record-hash",
      },
      {
        id: duplicateSourceRecordId,
        collectionRunId,
        sourceUrl: "https://example.invalid/new-office",
        sourceRecordKey: "duplicate-source-office",
        extractedValues: { name: "중복 출처·주소 검증 사무소" },
        normalizedValues: {
          name: "중복 출처·주소 검증 사무소",
          phoneNormalized: "0315556666",
          phoneDisplay: "031-555-6666",
          addressText: "경기도 수원시 팔달구 신규로 3",
        },
        contentHash: "duplicate-source-record-hash",
      },
    ]);
    const createdReviews = await db
      .insert(reviewItems)
      .values([
        {
          id: validReviewId,
          officeId: validOfficeId,
          collectedRecordId: validRecordId,
          type: "field_change",
          risk: "medium",
          previousValues: { summary: "기존 합성 소개" },
          proposedValues: { summary: "수집 제안 소개" },
          cause: "synthetic_field_change",
        },
        {
          id: invalidReviewId,
          officeId: invalidOfficeId,
          collectedRecordId: invalidRecordId,
          type: "field_change",
          risk: "medium",
          previousValues: { summary: "기존 합성 소개" },
          proposedValues: { summary: "근거 누락 제안" },
          cause: "synthetic_missing_evidence",
        },
        {
          id: newReviewId,
          collectedRecordId: newRecordId,
          type: "new_office",
          risk: "high",
          proposedValues: {
            name: "신규 수집 사무소",
            phoneNormalized: "18006624",
            phoneDisplay: "1800-6624",
            emailNormalized: "contact@example.invalid",
            emailDisplay: "contact@example.invalid",
            emailKind: "generic_business",
            addressText: "경기도 수원시 팔달구 신규로 3",
            summary: "신규 수집 소개",
          },
          cause: "synthetic_new_office",
        },
        {
          id: rollbackReviewId,
          collectedRecordId: rollbackRecordId,
          type: "new_office",
          risk: "high",
          proposedValues: {
            name: "롤백 검증 사무소",
            phoneNormalized: "0313334444",
            phoneDisplay: "031-333-4444",
            addressText: "경기도 수원시 팔달구 롤백로 4",
          },
          cause: "synthetic_rollback",
        },
        {
          id: duplicateSourceReviewId,
          collectedRecordId: duplicateSourceRecordId,
          type: "new_office",
          risk: "high",
          proposedValues: {
            name: "중복 출처·주소 검증 사무소",
            phoneNormalized: "0315556666",
            phoneDisplay: "031-555-6666",
            addressText: "경기도 수원시 팔달구 신규로 3",
          },
          cause: "synthetic_duplicate_source_address",
        },
      ])
      .returning({ id: reviewItems.id, updatedAt: reviewItems.updatedAt });
    const reviewUpdatedAt = new Map(
      createdReviews.map((review) => [review.id, review.updatedAt]),
    );

    assert.equal(await getPublicOfficeBySlug("sample-publication-office"), null);

    await db
      .update(officeSources)
      .set({ url: "javascript:alert(1)" })
      .where(eq(officeSources.id, invalidSourceId));
    await db
      .update(collectedRecords)
      .set({ sourceUrl: "javascript:alert(1)" })
      .where(eq(collectedRecords.id, invalidRecordId));
    await assert.rejects(
      approveReview({
        reviewItemId: invalidReviewId,
        actorId: "synthetic-reviewer",
        reason: "출처 URL 검증 사유",
        decision: "approved",
        expectedReviewUpdatedAt: reviewUpdatedAt.get(invalidReviewId)!,
        expectedOfficeUpdatedAt: invalidOffice.updatedAt,
      }),
      (error: unknown) => isApprovalError(error, "invalid_source_url"),
    );
    await db
      .update(officeSources)
      .set({ url: "https://example.invalid/invalid-office" })
      .where(eq(officeSources.id, invalidSourceId));
    await db
      .update(collectedRecords)
      .set({ sourceUrl: "https://example.invalid/invalid-office" })
      .where(eq(collectedRecords.id, invalidRecordId));

    await assert.rejects(
      approveReview({
        reviewItemId: invalidReviewId,
        actorId: "synthetic-reviewer",
        reason: "필수 업무 분야 근거 누락 검증",
        decision: "approved",
        expectedReviewUpdatedAt: reviewUpdatedAt.get(invalidReviewId)!,
        expectedOfficeUpdatedAt: invalidOffice.updatedAt,
      }),
      (error: unknown) => isApprovalError(error, "missing_evidence"),
    );
    const invalidAfterFailure = await getReviewItem(invalidReviewId);
    assert(invalidAfterFailure);
    assert.equal(invalidAfterFailure.status, "pending");
    assert.equal(invalidAfterFailure.office?.summary, "기존 합성 소개");
    assert.equal(invalidAfterFailure.actions.length, 0);

    await db
      .update(offices)
      .set({ status: "suspended" })
      .where(eq(offices.id, invalidOfficeId));
    await assert.rejects(
      approveReview({
        reviewItemId: invalidReviewId,
        actorId: "synthetic-reviewer",
        reason: "중지 업체의 일반 승인 공개 차단",
        decision: "approved",
        expectedReviewUpdatedAt: reviewUpdatedAt.get(invalidReviewId)!,
        expectedOfficeUpdatedAt: invalidOffice.updatedAt,
      }),
      (error: unknown) => isApprovalError(error, "restricted_office_status"),
    );
    await db
      .update(offices)
      .set({ status: "draft" })
      .where(eq(offices.id, invalidOfficeId));

    await assert.rejects(
      approveReview({
        reviewItemId: validReviewId,
        actorId: "synthetic-reviewer",
        reason: "짧음",
        decision: "approved",
        expectedReviewUpdatedAt: reviewUpdatedAt.get(validReviewId)!,
        expectedOfficeUpdatedAt: validOffice.updatedAt,
      }),
      (error: unknown) => isApprovalError(error, "invalid_review_item"),
    );

    const editedApproval = await approveReview({
      reviewItemId: validReviewId,
      actorId: " synthetic-reviewer ",
      reason: "  수집 소개를 출처 문맥에 맞게 수정 후 승인  ",
      decision: "approved_with_edits",
      expectedReviewUpdatedAt: reviewUpdatedAt.get(validReviewId)!,
      expectedOfficeUpdatedAt: validOffice.updatedAt,
      editedValues: {
        name: "변경해도 적용되지 않는 업체명",
        summary: "검수자가 다듬은 공개 소개",
        phoneDisplay: "000-0000-0000",
        addressText: "변경해도 적용되지 않는 주소",
      },
    });
    assert.equal(editedApproval.status, "published");
    assert.equal(editedApproval.decision, "approved_with_edits");

    const editedDetail = await getReviewItem(validReviewId);
    assert(editedDetail);
    assert.equal(editedDetail.status, "approved_with_edits");
    assert.equal(editedDetail.office?.name, "가상 검증 사무소");
    assert.equal(editedDetail.office?.summary, "검수자가 다듬은 공개 소개");
    assert.equal(editedDetail.office?.phoneDisplay, "031-000-0000");
    assert.equal(editedDetail.actions[0]?.decision, "approved_with_edits");
    assert.deepEqual(editedDetail.actions[0]?.editedValues, {
      name: "가상 검증 사무소",
      summary: "검수자가 다듬은 공개 소개",
      phoneNormalized: "0310000000",
      phoneDisplay: "031-000-0000",
      addressText: "경기도 수원시 팔달구 가상로 1",
    });

    const newApproval = await approveReview({
      reviewItemId: newReviewId,
      actorId: "synthetic-reviewer",
      reason: "신규 수집 후보의 출처와 운영 필드 확인",
      decision: "approved",
      expectedReviewUpdatedAt: reviewUpdatedAt.get(newReviewId)!,
      editedValues: {
        name: "승인에서는 무시되는 수정명",
        summary: "승인에서는 무시되는 소개",
        phoneDisplay: "031-999-9999",
        addressText: "승인에서는 무시되는 주소",
      },
      newOffice: {
        slug: "sample-collected-office",
        regionSlug: "gyeonggi-suwon-paldal",
        serviceCategorySlugs: ["family", "family"],
        sourceType: "official_website",
      },
    });
    assert.equal(newApproval.status, "published");
    const newDetail = await getReviewItem(newReviewId);
    assert(newDetail);
    assert.equal(newDetail.status, "approved");
    assert.equal(newDetail.office?.id, newApproval.id);
    assert.equal(newDetail.office?.name, "신규 수집 사무소");
    assert.equal(newDetail.office?.phoneDisplay, "1800-6624");
    assert.equal(newDetail.office?.emailDisplay, "contact@example.invalid");
    assert.equal(newDetail.actions[0]?.editedValues, null);
    assert.deepEqual(
      newDetail.office?.categories.map((item) => item.slug),
      ["family"],
    );
    assert.equal(newDetail.office?.sources[0]?.verifiedAt instanceof Date, true);
    const emailEvidenceRows = await db
      .select({ fieldName: officeSourceEvidence.fieldName })
      .from(officeSourceEvidence)
      .where(
        eq(
          officeSourceEvidence.officeSourceId,
          newDetail.office!.sources[0]!.id,
        ),
      );
    assert.equal(
      emailEvidenceRows.some((item) => item.fieldName === "email"),
      true,
    );
    const emailConsentRows = await db
      .select({ officeId: officeEmailMarketingConsents.officeId })
      .from(officeEmailMarketingConsents);
    assert.deepEqual(emailConsentRows, []);

    await assert.rejects(
      approveReview({
        reviewItemId: duplicateSourceReviewId,
        actorId: "synthetic-reviewer",
        reason: "같은 출처와 주소의 운영 업체 중복 승인 차단",
        decision: "approved",
        expectedReviewUpdatedAt: reviewUpdatedAt.get(duplicateSourceReviewId)!,
        newOffice: {
          slug: "sample-duplicate-source-office",
          regionSlug: "gyeonggi-suwon-paldal",
          serviceCategorySlugs: ["family"],
          sourceType: "official_website",
        },
      }),
      (error: unknown) => isApprovalError(error, "source_already_assigned"),
    );
    const duplicateSourceReview = await getReviewItem(duplicateSourceReviewId);
    assert(duplicateSourceReview);
    assert.equal(duplicateSourceReview.status, "pending");
    assert.equal(duplicateSourceReview.office, null);
    assert.equal(duplicateSourceReview.actions.length, 0);

    await assert.rejects(
      approveReview({
        reviewItemId: rollbackReviewId,
        actorId: "synthetic-reviewer",
        reason: "실패 시 전체 트랜잭션 롤백 검증",
        decision: "approved",
        expectedReviewUpdatedAt: reviewUpdatedAt.get(rollbackReviewId)!,
        newOffice: {
          slug: "sample-rollback-office",
          regionSlug: "gyeonggi-suwon-paldal",
          serviceCategorySlugs: ["not-an-active-category"],
          sourceType: "official_website",
        },
      }),
      (error: unknown) => isApprovalError(error, "inactive_category"),
    );
    assert.equal(await getPublicOfficeBySlug("sample-rollback-office"), null);
    const rollbackReview = await getReviewItem(rollbackReviewId);
    assert(rollbackReview);
    assert.equal(rollbackReview.status, "pending");
    assert.equal(rollbackReview.office, null);
    assert.equal(rollbackReview.actions.length, 0);

    const sharedSourceApproval = await approveReview({
      reviewItemId: rollbackReviewId,
      actorId: "synthetic-reviewer",
      reason: "공식 출처를 공유하는 별도 주소 지점 승인 검증",
      decision: "approved",
      expectedReviewUpdatedAt: reviewUpdatedAt.get(rollbackReviewId)!,
      newOffice: {
        slug: "sample-rollback-office",
        regionSlug: "gyeonggi-suwon-paldal",
        serviceCategorySlugs: ["evidence-fact-checking"],
        sourceType: "official_website",
      },
    });
    assert.equal(sharedSourceApproval.status, "published");
    const sharedSourceDetail = await getReviewItem(rollbackReviewId);
    assert(sharedSourceDetail);
    assert.equal(sharedSourceDetail.status, "approved");
    assert.equal(
      sharedSourceDetail.office?.sources[0]?.url,
      "https://example.invalid/new-office",
    );
    assert.deepEqual(
      sharedSourceDetail.office?.categories.map((item) => item.slug),
      ["evidence-fact-checking"],
    );

    const publishedList = await listPublicOffices({
      region: "gyeonggi",
      category: "family",
    });
    assert.deepEqual(
      new Set(publishedList.map((office) => office.slug)),
      new Set(["sample-publication-office", "sample-collected-office"]),
    );
    const editedPublic = await getPublicOfficeBySlug(
      "sample-publication-office",
    );
    assert(editedPublic);
    assert.equal(editedPublic.summary, "검수자가 다듬은 공개 소개");
    const newPublic = await getPublicOfficeBySlug("sample-collected-office");
    assert(newPublic);
    assert.equal(newPublic.name, "신규 수집 사무소");
    assert.equal(newPublic.sources.length, 1);

    const filterOptions = await listPublicDirectoryFilterOptions();
    assert.equal(
      filterOptions.regions.find(
        (option) => option.slug === "gyeonggi-suwon-paldal",
      )?.label,
      "경기도 / 수원시 / 팔달구",
    );
    assert(filterOptions.categories.some((option) => option.slug === "family"));
    await assert.rejects(
      listPublicOffices({ region: "unsupported-region" }),
      (error: unknown) =>
        error instanceof PublicDirectoryFilterError && error.field === "region",
    );
    await assert.rejects(
      approveReview({
        reviewItemId: validReviewId,
        actorId: "synthetic-reviewer",
        reason: "동시성 검증을 위한 재승인 시도",
        decision: "approved",
        expectedReviewUpdatedAt: reviewUpdatedAt.get(validReviewId)!,
        expectedOfficeUpdatedAt: validOffice.updatedAt,
      }),
      (error: unknown) => isApprovalError(error, "concurrent_change"),
    );

    const pendingQueue = await listReviewQueue("pending");
    assert.deepEqual(
      pendingQueue.map((item) => item.id),
      [duplicateSourceReviewId, invalidReviewId],
    );
    await assert.rejects(
      listReviewQueue("unsupported"),
      (error: unknown) =>
        error instanceof ReviewQueueFilterError && error.field === "status",
    );

    const heldReview = await resolveReview({
      reviewItemId: invalidReviewId,
      decision: "on_hold",
      actorId: "synthetic-reviewer",
      reason: "출처 근거 보강이 필요합니다.",
      expectedUpdatedAt: invalidAfterFailure.updatedAt,
    });
    assert.equal(heldReview.status, "on_hold");
    assert.equal(heldReview.resolvedAt, null);
    await assert.rejects(
      approveReview({
        reviewItemId: invalidReviewId,
        actorId: "synthetic-reviewer",
        reason: "보류 항목의 근거 누락 재확인",
        decision: "approved",
        expectedReviewUpdatedAt: heldReview.updatedAt,
        expectedOfficeUpdatedAt: invalidOffice.updatedAt,
      }),
      (error: unknown) => isApprovalError(error, "missing_evidence"),
    );
    const rejectedReview = await resolveReview({
      reviewItemId: invalidReviewId,
      decision: "rejected",
      actorId: "synthetic-reviewer",
      reason: "필수 출처 근거가 확인되지 않았습니다.",
      expectedUpdatedAt: heldReview.updatedAt,
    });
    assert.equal(rejectedReview.status, "rejected");
    assert(rejectedReview.resolvedAt);
    const rejectedDetail = await getReviewItem(invalidReviewId);
    assert(rejectedDetail);
    assert.deepEqual(
      rejectedDetail.actions.map((action) => action.decision),
      ["rejected", "on_hold"],
    );
    await assert.rejects(
      resolveReview({
        reviewItemId: invalidReviewId,
        decision: "rejected",
        actorId: "synthetic-reviewer",
        reason: "동시성 충돌 검증 사유입니다.",
        expectedUpdatedAt: heldReview.updatedAt,
      }),
      (error: unknown) =>
        error instanceof ReviewResolutionError &&
        error.reason === "concurrent_change",
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

    console.log(
      "Publication, public directory, role, and moderation verification completed.",
    );
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

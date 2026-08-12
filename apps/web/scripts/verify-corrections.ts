import assert from "node:assert/strict";

import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";

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
  CORRECTION_REQUEST_OFFICE_LIMIT,
  CorrectionRequestError,
  createCorrectionRequest,
} from "../src/modules/corrections/create-correction-request";
import {
  approveReview,
  ReviewApprovalError,
} from "../src/modules/moderation/approve-review";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const officeId = "71000000-0000-4000-8000-000000000001";
const draftOfficeId = "71000000-0000-4000-8000-000000000002";
const primarySourceId = "72000000-0000-4000-8000-000000000001";
const officeSlug = "sample-correction-office";
const draftOfficeSlug = "sample-draft-correction-office";
const submittedEvidenceUrl = "https://reporter.example.invalid/name";
const verifiedEvidenceUrl = "https://official.example.invalid/name";

function isCorrectionError(error: unknown, reason: string) {
  return error instanceof CorrectionRequestError && error.reason === reason;
}

function isApprovalError(error: unknown, reason: string) {
  return error instanceof ReviewApprovalError && error.reason === reason;
}

async function cleanup() {
  const db = getDatabase();
  const reviewRows = await db
    .select({ id: reviewItems.id })
    .from(reviewItems)
    .where(inArray(reviewItems.officeId, [officeId, draftOfficeId]));
  const reviewIds = reviewRows.map((review) => review.id);

  if (reviewIds.length > 0) {
    await db
      .delete(reviewActions)
      .where(inArray(reviewActions.reviewItemId, reviewIds));
    await db.delete(reviewItems).where(inArray(reviewItems.id, reviewIds));
  }

  await db.delete(offices).where(inArray(offices.id, [officeId, draftOfficeId]));
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
    await db.insert(offices).values([
      {
        id: officeId,
        slug: officeSlug,
        name: "가상 정정 검증 사무소",
        summary: "정정 전 소개",
        phoneNormalized: "0312223333",
        phoneDisplay: "031-222-3333",
        addressText: "경기도 수원시 팔달구 정정로 1",
        regionId: region.id,
        status: "published",
        publishedAt: now,
        lastVerifiedAt: now,
        updatedAt: now,
      },
      {
        id: draftOfficeId,
        slug: draftOfficeSlug,
        name: "가상 비공개 사무소",
        summary: "비공개 소개",
        phoneNormalized: "0312224444",
        phoneDisplay: "031-222-4444",
        addressText: "경기도 수원시 팔달구 비공개로 2",
        regionId: region.id,
        status: "draft",
        lastVerifiedAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(officeServiceCategories).values({
      officeId,
      serviceCategoryId: category.id,
    });
    await db.insert(officeSources).values({
      id: primarySourceId,
      officeId,
      sourceType: "official_website",
      url: "https://official.example.invalid/original",
      retrievedAt: now,
      verifiedAt: now,
      isPrimary: true,
      accessStatus: "available",
      updatedAt: now,
    });
    await db.insert(officeSourceEvidence).values([
      { officeSourceId: primarySourceId, fieldName: "name", verifiedAt: now },
      { officeSourceId: primarySourceId, fieldName: "phone", verifiedAt: now },
      { officeSourceId: primarySourceId, fieldName: "address", verifiedAt: now },
      {
        officeSourceId: primarySourceId,
        fieldName: "service_category",
        serviceCategoryId: category.id,
        verifiedAt: now,
      },
    ]);

    await assert.rejects(
      createCorrectionRequest({
        officeSlug,
        field: "name",
        suggestedValue: "수정 상호",
        requesterRole: "public_user",
        sensitiveContentConfirmed: false,
      }),
      (error) => isCorrectionError(error, "sensitive_confirmation_required"),
    );
    await assert.rejects(
      createCorrectionRequest({
        officeSlug: draftOfficeSlug,
        field: "name",
        suggestedValue: "수정 상호",
        requesterRole: "public_user",
        sensitiveContentConfirmed: true,
      }),
      (error) => isCorrectionError(error, "office_not_found"),
    );

    const created = await createCorrectionRequest({
      officeSlug,
      field: "name",
      suggestedValue: "가상 정정 완료 사무소",
      requesterRole: "office_representative",
      evidenceUrl: submittedEvidenceUrl,
      sensitiveContentConfirmed: true,
    });
    const [createdReview] = await db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.id, created.reviewItemId))
      .limit(1);

    assert(createdReview);
    assert.equal(createdReview.type, "correction_request");
    assert.equal(createdReview.risk, "high");
    assert.equal(createdReview.status, "pending");
    assert.deepEqual(createdReview.previousValues, {
      name: "가상 정정 검증 사무소",
    });
    assert.deepEqual(createdReview.proposedValues, {
      name: "가상 정정 완료 사무소",
      requestedField: "name",
      requesterRole: "office_representative",
      evidenceUrl: submittedEvidenceUrl,
    });
    assert.equal(createdReview.cause, "public_correction_request");
    assert.equal(createdReview.collectedRecordId, null);

    await assert.rejects(
      createCorrectionRequest({
        officeSlug,
        field: "name",
        suggestedValue: "가상 정정 완료 사무소",
        requesterRole: "office_representative",
        evidenceUrl: submittedEvidenceUrl,
        sensitiveContentConfirmed: true,
      }),
      (error) => isCorrectionError(error, "duplicate"),
    );

    const [officeBeforeApproval] = await db
      .select({
        updatedAt: offices.updatedAt,
        name: offices.name,
        phoneDisplay: offices.phoneDisplay,
        addressText: offices.addressText,
        summary: offices.summary,
      })
      .from(offices)
      .where(eq(offices.id, officeId))
      .limit(1);

    assert(officeBeforeApproval);
    await assert.rejects(
      approveReview({
        reviewItemId: created.reviewItemId,
        actorId: "synthetic-reviewer",
        reason: "공식 공개 출처를 확인했습니다.",
        decision: "approved_with_edits",
        expectedReviewUpdatedAt: createdReview.updatedAt,
        expectedOfficeUpdatedAt: officeBeforeApproval.updatedAt,
        editedValues: {
          name: "가상 운영자 확인 사무소",
          phoneDisplay: officeBeforeApproval.phoneDisplay ?? "",
          addressText: officeBeforeApproval.addressText ?? "",
          summary: officeBeforeApproval.summary ?? "",
        },
        correctionSource: {
          url: "javascript:alert(1)",
          sourceType: "official_website",
        },
      }),
      (error) => isApprovalError(error, "invalid_source_url"),
    );

    const [unchangedOffice] = await db
      .select({ name: offices.name, updatedAt: offices.updatedAt })
      .from(offices)
      .where(eq(offices.id, officeId))
      .limit(1);
    assert(unchangedOffice);
    assert.equal(unchangedOffice.name, officeBeforeApproval.name);
    assert.equal(
      unchangedOffice.updatedAt.getTime(),
      officeBeforeApproval.updatedAt.getTime(),
    );

    await approveReview({
      reviewItemId: created.reviewItemId,
      actorId: "synthetic-reviewer",
      reason: "공식 공개 출처를 확인했습니다.",
      decision: "approved_with_edits",
      expectedReviewUpdatedAt: createdReview.updatedAt,
      expectedOfficeUpdatedAt: officeBeforeApproval.updatedAt,
      editedValues: {
        name: "가상 운영자 확인 사무소",
        phoneDisplay: officeBeforeApproval.phoneDisplay ?? "",
        addressText: officeBeforeApproval.addressText ?? "",
        summary: officeBeforeApproval.summary ?? "",
      },
      correctionSource: {
        url: verifiedEvidenceUrl,
        sourceType: "official_website",
      },
    });

    const [approvedReview] = await db
      .select({ status: reviewItems.status })
      .from(reviewItems)
      .where(eq(reviewItems.id, created.reviewItemId))
      .limit(1);
    const [updatedOffice] = await db
      .select({
        name: offices.name,
        status: offices.status,
        lastVerifiedAt: offices.lastVerifiedAt,
      })
      .from(offices)
      .where(eq(offices.id, officeId))
      .limit(1);
    const [verifiedSource] = await db
      .select({ id: officeSources.id, isPrimary: officeSources.isPrimary })
      .from(officeSources)
      .where(
        and(
          eq(officeSources.officeId, officeId),
          eq(officeSources.url, verifiedEvidenceUrl),
        ),
      )
      .limit(1);
    const [untrustedSource] = await db
      .select({ id: officeSources.id })
      .from(officeSources)
      .where(
        and(
          eq(officeSources.officeId, officeId),
          eq(officeSources.url, submittedEvidenceUrl),
        ),
      )
      .limit(1);
    const [verifiedEvidence] = verifiedSource
      ? await db
          .select({ fieldName: officeSourceEvidence.fieldName })
          .from(officeSourceEvidence)
          .where(
            and(
              eq(officeSourceEvidence.officeSourceId, verifiedSource.id),
              eq(officeSourceEvidence.fieldName, "name"),
            ),
          )
          .limit(1)
      : [];
    const [approvalAction] = await db
      .select({
        decision: reviewActions.decision,
        editedValues: reviewActions.editedValues,
      })
      .from(reviewActions)
      .where(eq(reviewActions.reviewItemId, created.reviewItemId))
      .limit(1);

    assert.equal(approvedReview?.status, "approved_with_edits");
    assert.equal(updatedOffice?.name, "가상 운영자 확인 사무소");
    assert.equal(updatedOffice?.status, "published");
    assert(updatedOffice?.lastVerifiedAt);
    assert.equal(verifiedSource?.isPrimary, false);
    assert.equal(verifiedEvidence?.fieldName, "name");
    assert.equal(untrustedSource, undefined);
    assert.equal(approvalAction?.decision, "approved_with_edits");
    assert.deepEqual(approvalAction?.editedValues, {
      name: "가상 운영자 확인 사무소",
      summary: "정정 전 소개",
      phoneNormalized: "0312223333",
      phoneDisplay: "031-222-3333",
      addressText: "경기도 수원시 팔달구 정정로 1",
      correctionSourceUrl: verifiedEvidenceUrl,
      correctionSourceType: "official_website",
    });

    for (
      let index = 0;
      index < CORRECTION_REQUEST_OFFICE_LIMIT - 1;
      index += 1
    ) {
      await createCorrectionRequest({
        officeSlug,
        field: "summary",
        suggestedValue: `속도 제한 검증 소개 ${index}`,
        requesterRole: "public_user",
        sensitiveContentConfirmed: true,
      });
    }
    await assert.rejects(
      createCorrectionRequest({
        officeSlug,
        field: "summary",
        suggestedValue: "속도 제한 초과 소개",
        requesterRole: "public_user",
        sensitiveContentConfirmed: true,
      }),
      (error) => isCorrectionError(error, "rate_limited"),
    );

    console.log(
      "Correction request ingestion, abuse controls, verified-source approval, and rollback checks passed.",
    );
  } finally {
    await cleanup();
    await closeDatabase();
  }
}

void main();

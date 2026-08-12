import assert from "node:assert/strict";

import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { closeDatabase, getDatabase } from "../src/db";
import {
  collectedRecords,
  collectionRuns,
  offices,
  reviewItems,
} from "../src/db/schema";
import {
  createManualOfficeCandidate,
  ManualOfficeCandidateError,
} from "../src/modules/moderation/create-manual-office-candidate";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const actorId = "user_manual_candidate_verifier";
const sourceUrl = "https://manual-candidate.example.invalid/office";

function isCandidateError(error: unknown, reason: string) {
  return (
    error instanceof ManualOfficeCandidateError && error.reason === reason
  );
}

async function cleanup() {
  const db = getDatabase();
  const runs = await db
    .select({ id: collectionRuns.id })
    .from(collectionRuns)
    .where(eq(collectionRuns.sourceName, "manual-admin"));

  for (const run of runs) {
    const records = await db
      .select({ id: collectedRecords.id })
      .from(collectedRecords)
      .where(eq(collectedRecords.collectionRunId, run.id));

    for (const record of records) {
      await db
        .delete(reviewItems)
        .where(eq(reviewItems.collectedRecordId, record.id));
    }
  }

  await db
    .delete(collectionRuns)
    .where(eq(collectionRuns.sourceName, "manual-admin"));
}

async function main() {
  const db = getDatabase();

  try {
    await cleanup();

    await assert.rejects(
      createManualOfficeCandidate({
        actorId,
        sourceUrl,
        name: "가상 수동 후보",
        phoneDisplay: "031-123-4567",
        addressText: "경기도 수원시 가상로 1",
        officialSourceConfirmed: false,
        sensitiveContentConfirmed: true,
      }),
      (error: unknown) =>
        isCandidateError(error, "official_source_confirmation_required"),
    );
    await assert.rejects(
      createManualOfficeCandidate({
        actorId,
        sourceUrl,
        name: "가상 수동 후보",
        phoneDisplay: "031-123-4567",
        addressText: "경기도 수원시 가상로 1",
        officialSourceConfirmed: true,
        sensitiveContentConfirmed: false,
      }),
      (error: unknown) =>
        isCandidateError(error, "sensitive_content_confirmation_required"),
    );
    await assert.rejects(
      createManualOfficeCandidate({
        actorId,
        sourceUrl: "javascript:alert(1)",
        name: "가상 수동 후보",
        phoneDisplay: "031-123-4567",
        addressText: "경기도 수원시 가상로 1",
        officialSourceConfirmed: true,
        sensitiveContentConfirmed: true,
      }),
      (error: unknown) => isCandidateError(error, "invalid_source_url"),
    );
    await assert.rejects(
      createManualOfficeCandidate({
        actorId,
        sourceUrl,
        name: "가상 수동 후보",
        phoneDisplay: "1234",
        addressText: "경기도 수원시 가상로 1",
        officialSourceConfirmed: true,
        sensitiveContentConfirmed: true,
      }),
      (error: unknown) => isCandidateError(error, "invalid_phone"),
    );
    const nationalRepresentativeCandidate = await createManualOfficeCandidate({
      actorId,
      sourceUrl: `${sourceUrl}/national-representative-number`,
      name: "가상 전국 대표번호 후보",
      phoneDisplay: "1800-6624",
      addressText: "서울특별시 서초구 가상로 2",
      officialSourceConfirmed: true,
      sensitiveContentConfirmed: true,
    });
    const [nationalRepresentativeReview] = await db
      .select({ proposedValues: reviewItems.proposedValues })
      .from(reviewItems)
      .where(eq(reviewItems.id, nationalRepresentativeCandidate.reviewItemId))
      .limit(1);

    assert(nationalRepresentativeReview);
    assert.deepEqual(nationalRepresentativeReview.proposedValues, {
      name: "가상 전국 대표번호 후보",
      phoneDisplay: "1800-6624",
      phoneNormalized: "18006624",
      addressText: "서울특별시 서초구 가상로 2",
    });

    const officeCountBefore = await db
      .select({ count: offices.id })
      .from(offices);
    const created = await createManualOfficeCandidate({
      actorId,
      sourceUrl,
      name: "  가상   수동 후보  ",
      phoneDisplay: "+82 31-123-4567",
      addressText: "  경기도 수원시   가상로 1  ",
      officialSourceConfirmed: true,
      sensitiveContentConfirmed: true,
    });
    const [review] = await db
      .select({
        status: reviewItems.status,
        risk: reviewItems.risk,
        type: reviewItems.type,
        proposedValues: reviewItems.proposedValues,
        submittedByActorId: reviewItems.submittedByActorId,
        sourceUrl: collectedRecords.sourceUrl,
        adapterName: collectionRuns.adapterName,
        runStatus: collectionRuns.status,
      })
      .from(reviewItems)
      .innerJoin(
        collectedRecords,
        eq(reviewItems.collectedRecordId, collectedRecords.id),
      )
      .innerJoin(
        collectionRuns,
        eq(collectedRecords.collectionRunId, collectionRuns.id),
      )
      .where(eq(reviewItems.id, created.reviewItemId))
      .limit(1);
    const officeCountAfter = await db
      .select({ count: offices.id })
      .from(offices);

    assert(review);
    assert.equal(review.status, "pending");
    assert.equal(review.risk, "high");
    assert.equal(review.type, "new_office");
    assert.equal(review.submittedByActorId, actorId);
    assert.equal(review.sourceUrl, sourceUrl);
    assert.equal(review.adapterName, "manual_admin");
    assert.equal(review.runStatus, "succeeded");
    assert.deepEqual(review.proposedValues, {
      name: "가상 수동 후보",
      phoneDisplay: "+82 31-123-4567",
      phoneNormalized: "0311234567",
      addressText: "경기도 수원시 가상로 1",
    });
    assert.equal(officeCountAfter.length, officeCountBefore.length);

    await assert.rejects(
      createManualOfficeCandidate({
        actorId: "user_second_verifier",
        sourceUrl: `${sourceUrl}#contact`,
        name: "중복 후보",
        phoneDisplay: "031-123-4567",
        addressText: "경기도 수원시 가상로 1",
        officialSourceConfirmed: true,
        sensitiveContentConfirmed: true,
      }),
      (error: unknown) =>
        isCandidateError(error, "duplicate") &&
        error instanceof ManualOfficeCandidateError &&
        error.existingReviewItemId === created.reviewItemId,
    );

    const branch = await createManualOfficeCandidate({
      actorId: "user_branch_verifier",
      sourceUrl,
      name: "가상 수동 후보 수원점",
      phoneDisplay: "031-123-4567",
      addressText: "경기도 수원시 다른로 2",
      officialSourceConfirmed: true,
      sensitiveContentConfirmed: true,
    });
    const [branchReview] = await db
      .select({
        status: reviewItems.status,
        proposedValues: reviewItems.proposedValues,
        submittedByActorId: reviewItems.submittedByActorId,
      })
      .from(reviewItems)
      .where(eq(reviewItems.id, branch.reviewItemId))
      .limit(1);
    const officeCountAfterBranch = await db
      .select({ count: offices.id })
      .from(offices);

    assert.notEqual(branch.reviewItemId, created.reviewItemId);
    assert(branchReview);
    assert.equal(branchReview.status, "pending");
    assert.equal(branchReview.submittedByActorId, "user_branch_verifier");
    assert.deepEqual(branchReview.proposedValues, {
      name: "가상 수동 후보 수원점",
      phoneDisplay: "031-123-4567",
      phoneNormalized: "0311234567",
      addressText: "경기도 수원시 다른로 2",
    });
    assert.equal(officeCountAfterBranch.length, officeCountBefore.length);

    console.log("Manual office candidate verification completed.");
  } finally {
    await cleanup();
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Manual office candidate verification failed.",
  );
  process.exitCode = 1;
});

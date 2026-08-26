import assert from "node:assert/strict";

import { and, eq } from "drizzle-orm";

import { closeDatabase, getDatabase } from "../src/db";
import {
  collectedRecords,
  collectionRuns,
  reviewItems,
} from "../src/db/schema";
import {
  parseDiscoveryReviewCandidates,
  stageDiscoveryReviewCandidates,
} from "../src/modules/moderation/discovery-review-intake";

const actorId = "user_discovery_intake_verifier";
const now = new Date("2026-08-26T03:00:00.000Z");

function syntheticInput() {
  return JSON.stringify({
    version: 3,
    rules_version: "office-discovery-review-v3",
    candidate_id: "e".repeat(64),
    candidate_name: "가상 공식 탐정사무소",
    candidate_address: "서울특별시 강남구 가상로 16",
    phone_normalized: "0212345678",
    phone_display: "02-1234-5678",
    email_normalized: null,
    email_display: null,
    email_kind: null,
    source_url: "https://discovery-intake.example.invalid/office",
    evidence_status: "strong_fact_match",
    business_relevance: "probable",
    relevance_reason_codes: ["STRONG_OFFICE_NAME"],
    business_service_match: true,
    name_match: true,
    address_match: true,
    region_match: true,
    evidence_run_id: "synthetic-official-run",
    checked_at: "2026-08-26T02:00:00.000Z",
    expires_at: "2026-09-01T02:00:00.000Z",
    review_status: "pending",
    promotion_allowed: false,
  });
}

async function cleanup() {
  const db = getDatabase();
  const runs = await db
    .select({ id: collectionRuns.id })
    .from(collectionRuns)
    .where(eq(collectionRuns.sourceName, "official-discovery-intake"));
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
    .where(eq(collectionRuns.sourceName, "official-discovery-intake"));
}

async function main() {
  const db = getDatabase();
  process.env.CLERK_REVIEWER_USER_IDS = actorId;
  const parsed = parseDiscoveryReviewCandidates(syntheticInput(), now);

  try {
    await cleanup();
    const dryRun = await stageDiscoveryReviewCandidates({
      parsed,
      dryRun: true,
    });
    assert.equal(dryRun.stagedCount, 1);
    assert.equal(dryRun.dryRun, true);
    const [afterDryRun] = await db
      .select({ count: reviewItems.id })
      .from(reviewItems)
      .where(eq(reviewItems.cause, "official_discovery_candidate"));
    assert.equal(afterDryRun, undefined);

    const applied = await stageDiscoveryReviewCandidates({
      parsed,
      dryRun: false,
      actorId,
    });
    assert.equal(applied.stagedCount, 1);
    assert.equal(applied.dryRun, false);

    const [review] = await db
      .select({
        status: reviewItems.status,
        risk: reviewItems.risk,
        type: reviewItems.type,
        cause: reviewItems.cause,
        submittedByActorId: reviewItems.submittedByActorId,
        proposedValues: reviewItems.proposedValues,
        sourceName: collectionRuns.sourceName,
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
      .where(
        and(
          eq(reviewItems.cause, "official_discovery_candidate"),
          eq(collectionRuns.sourceName, "official-discovery-intake"),
        ),
      )
      .limit(1);
    assert(review);
    assert.equal(review.status, "pending");
    assert.equal(review.risk, "high");
    assert.equal(review.type, "new_office");
    assert.equal(review.submittedByActorId, actorId);
    assert.equal(
      (review.proposedValues as Record<string, unknown>).discoveryCandidateId,
      "e".repeat(64),
    );

    const repeated = await stageDiscoveryReviewCandidates({
      parsed,
      dryRun: false,
      actorId,
    });
    assert.equal(repeated.stagedCount, 0);
    assert.equal(repeated.unresolvedDuplicateCount, 1);
    console.log("Discovery review intake verification completed.");
  } finally {
    await cleanup();
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "unknown_error");
    process.exitCode = 1;
  })
  .finally(closeDatabase);

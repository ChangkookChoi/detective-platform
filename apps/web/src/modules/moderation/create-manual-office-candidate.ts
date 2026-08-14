import { createHash } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  collectedRecords,
  collectionRuns,
  reviewItems,
} from "@/db/schema";
import { normalizeDomesticPhoneDigits } from "@/modules/shared/domestic-phone";
import { isPublicHttpUrl } from "@/modules/shared/public-url";

export type ManualOfficeCandidateFailure =
  | "duplicate"
  | "invalid_actor"
  | "invalid_address"
  | "invalid_name"
  | "invalid_phone"
  | "invalid_source_url"
  | "official_source_confirmation_required"
  | "sensitive_content_confirmation_required";

export class ManualOfficeCandidateError extends Error {
  constructor(
    public readonly reason: ManualOfficeCandidateFailure,
    public readonly existingReviewItemId?: string,
  ) {
    super(`Manual office candidate creation failed: ${reason}`);
    this.name = "ManualOfficeCandidateError";
  }
}

type CreateManualOfficeCandidateInput = {
  actorId: string;
  sourceUrl: string;
  name: string;
  phoneDisplay: string;
  addressText: string;
  officialSourceConfirmed: boolean;
  sensitiveContentConfirmed: boolean;
  batch?: {
    batchId: string;
    slug: string;
    regionSlug: string;
    serviceCategorySlugs: string[];
    sourceType: string;
    evidenceNote: string;
    distinctBranchReviewed: boolean;
  };
  createdAt?: Date;
};

function normalizeRequiredText(
  value: string,
  minLength: number,
  maxLength: number,
  failure: ManualOfficeCandidateFailure,
) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new ManualOfficeCandidateError(failure);
  }

  return normalized;
}

function normalizeSourceUrl(value: string) {
  const trimmed = value.trim();

  if (!isPublicHttpUrl(trimmed)) {
    throw new ManualOfficeCandidateError("invalid_source_url");
  }

  const url = new URL(trimmed);

  if (url.username || url.password) {
    throw new ManualOfficeCandidateError("invalid_source_url");
  }

  url.hash = "";
  return url.toString();
}

function normalizePhone(value: string) {
  const display = normalizeRequiredText(value, 9, 50, "invalid_phone");
  const normalized = normalizeDomesticPhoneDigits(display);

  if (!normalized) {
    throw new ManualOfficeCandidateError("invalid_phone");
  }

  return { display, normalized };
}

export async function createManualOfficeCandidate(
  input: CreateManualOfficeCandidateInput,
) {
  if (input.officialSourceConfirmed !== true) {
    throw new ManualOfficeCandidateError(
      "official_source_confirmation_required",
    );
  }

  if (input.sensitiveContentConfirmed !== true) {
    throw new ManualOfficeCandidateError(
      "sensitive_content_confirmation_required",
    );
  }

  const actorId = normalizeRequiredText(
    input.actorId,
    1,
    200,
    "invalid_actor",
  );
  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const name = normalizeRequiredText(input.name, 2, 200, "invalid_name");
  const phone = normalizePhone(input.phoneDisplay);
  const addressText = normalizeRequiredText(
    input.addressText,
    5,
    500,
    "invalid_address",
  );
  const createdAt = input.createdAt ?? new Date();
  const extractedValues = {
    name,
    telephone: phone.display,
    address: addressText,
  };
  const proposedValues = {
    name,
    phoneDisplay: phone.display,
    phoneNormalized: phone.normalized,
    addressText,
    ...(input.batch
      ? {
          batchId: normalizeRequiredText(
            input.batch.batchId,
            3,
            100,
            "invalid_source_url",
          ),
          slug: normalizeRequiredText(
            input.batch.slug,
            3,
            80,
            "invalid_source_url",
          ),
          regionSlug: normalizeRequiredText(
            input.batch.regionSlug,
            1,
            100,
            "invalid_source_url",
          ),
          serviceCategorySlugs: [...input.batch.serviceCategorySlugs],
          sourceType: normalizeRequiredText(
            input.batch.sourceType,
            1,
            100,
            "invalid_source_url",
          ),
          evidenceNote: normalizeRequiredText(
            input.batch.evidenceNote,
            10,
            1000,
            "invalid_source_url",
          ),
          distinctBranchReviewed: input.batch.distinctBranchReviewed,
        }
      : {}),
  };
  const contentHash = createHash("sha256")
    .update(JSON.stringify({ sourceUrl, ...proposedValues }))
    .digest("hex");
  const sourceRecordKey = `manual:${createHash("sha256")
    .update(sourceUrl)
    .digest("hex")}`;
  const db = getDatabase();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${sourceUrl}, 0))`,
    );

    const [duplicate] = await tx
      .select({ id: reviewItems.id })
      .from(reviewItems)
      .innerJoin(
        collectedRecords,
        eq(reviewItems.collectedRecordId, collectedRecords.id),
      )
      .where(
        and(
          eq(reviewItems.type, "new_office"),
          inArray(reviewItems.status, ["pending", "on_hold"]),
          eq(collectedRecords.sourceUrl, sourceUrl),
          sql`${reviewItems.proposedValues}->>'addressText' = ${addressText}`,
        ),
      )
      .limit(1);

    if (duplicate) {
      throw new ManualOfficeCandidateError("duplicate", duplicate.id);
    }

    const [run] = await tx
      .insert(collectionRuns)
      .values({
        sourceName: "manual-admin",
        adapterName: input.batch ? "manual_admin_batch" : "manual_admin",
        extractorVersion: input.batch ? "manual-batch-v1" : "manual-v1",
        status: "succeeded",
        startedAt: createdAt,
        finishedAt: createdAt,
        discoveredCount: 1,
        collectedCount: 1,
        failedCount: 0,
      })
      .returning({ id: collectionRuns.id });

    if (!run) {
      throw new ManualOfficeCandidateError("invalid_source_url");
    }

    const [record] = await tx
      .insert(collectedRecords)
      .values({
        collectionRunId: run.id,
        sourceUrl,
        sourceRecordKey,
        collectedAt: createdAt,
        extractedValues,
        normalizedValues: proposedValues,
        contentHash,
      })
      .returning({ id: collectedRecords.id });

    if (!record) {
      throw new ManualOfficeCandidateError("invalid_source_url");
    }

    const [review] = await tx
      .insert(reviewItems)
      .values({
        collectedRecordId: record.id,
        type: "new_office",
        risk: "high",
        status: "pending",
        proposedValues,
        cause: input.batch
          ? "manual_official_source_batch"
          : "manual_official_source_candidate",
        submittedByActorId: actorId,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: reviewItems.id });

    if (!review) {
      throw new ManualOfficeCandidateError("invalid_source_url");
    }

    return {
      reviewItemId: review.id,
      sourceUrl,
      submittedByActorId: actorId,
    } as const;
  });
}

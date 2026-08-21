import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  collectedRecords,
  officeServiceCategories,
  officeSources,
  offices,
  regions,
  reviewItems,
  serviceCategories,
} from "@/db/schema";
import {
  approveReview,
  approvalSourceTypes,
  ReviewApprovalError,
  type ApprovalSourceType,
  type NewOfficeMetadata,
} from "@/modules/moderation/approve-review";
import {
  createManualOfficeCandidate,
  ManualOfficeCandidateError,
} from "@/modules/moderation/create-manual-office-candidate";
import { normalizeDomesticPhoneDigits } from "@/modules/shared/domestic-phone";
import { normalizeOptionalBusinessEmail } from "@/modules/shared/business-email";
import { isPublicHttpUrl } from "@/modules/shared/public-url";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const categorySlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maximumBatchSize = 50;
const maximumFileBytes = 250_000;
const maximumPreflightAgeMilliseconds = 24 * 60 * 60 * 1000;

export type OfficeBatchCandidate = {
  sourceUrl: string;
  name: string;
  phoneDisplay: string;
  emailDisplay?: string;
  addressText: string;
  slug: string;
  regionSlug: string;
  serviceCategorySlugs: string[];
  sourceType: ApprovalSourceType;
  evidenceNote: string;
  distinctBranchReviewed: boolean;
};

export type OfficeReviewBatch = {
  batchId: string;
  verifiedAt: string;
  candidates: OfficeBatchCandidate[];
};

export type OfficeReviewBatchFailure =
  | "batch_not_found"
  | "batch_too_large"
  | "candidate_not_in_batch"
  | "confirmation_required"
  | "duplicate_candidate"
  | "invalid_batch"
  | "invalid_preflight"
  | "no_candidate_selected"
  | "preflight_expired"
  | "preflight_failed";

export class OfficeReviewBatchError extends Error {
  constructor(public readonly reason: OfficeReviewBatchFailure) {
    super(`Office review batch failed: ${reason}`);
    this.name = "OfficeReviewBatchError";
  }
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OfficeReviewBatchError("invalid_batch");
  }
  return value as Record<string, unknown>;
}

function requiredText(
  value: unknown,
  minimum: number,
  maximum: number,
  failure: "invalid_batch" | "invalid_preflight" = "invalid_batch",
) {
  if (typeof value !== "string") {
    throw new OfficeReviewBatchError(failure);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new OfficeReviewBatchError(failure);
  }
  return normalized;
}

function parseCandidate(value: unknown): OfficeBatchCandidate {
  const candidate = asRecord(value);
  const sourceUrl = requiredText(candidate.sourceUrl, 8, 2048);
  const slug = requiredText(candidate.slug, 3, 80).toLowerCase();
  const regionSlug = requiredText(candidate.regionSlug, 1, 100);
  const sourceType = requiredText(candidate.sourceType, 1, 100);
  const distinctBranchReviewed = candidate.distinctBranchReviewed ?? false;
  const categoryValues = candidate.serviceCategorySlugs;
  let email: ReturnType<typeof normalizeOptionalBusinessEmail> = null;
  try {
    email = normalizeOptionalBusinessEmail(candidate.emailDisplay);
  } catch {
    throw new OfficeReviewBatchError("invalid_batch");
  }

  if (
    !isPublicHttpUrl(sourceUrl) ||
    !slugPattern.test(slug) ||
    !categorySlugPattern.test(regionSlug) ||
    !approvalSourceTypes.includes(sourceType as ApprovalSourceType) ||
    typeof distinctBranchReviewed !== "boolean" ||
    (distinctBranchReviewed && sourceType !== "official_website") ||
    !Array.isArray(categoryValues) ||
    categoryValues.length === 0 ||
    categoryValues.length > 10
  ) {
    throw new OfficeReviewBatchError("invalid_batch");
  }

  const serviceCategorySlugs = [
    ...new Set(
      categoryValues.map((item) => requiredText(item, 1, 100)),
    ),
  ].sort();
  if (
    serviceCategorySlugs.length !== categoryValues.length ||
    serviceCategorySlugs.some((item) => !categorySlugPattern.test(item))
  ) {
    throw new OfficeReviewBatchError("invalid_batch");
  }

  return {
    sourceUrl: new URL(sourceUrl).toString(),
    name: requiredText(candidate.name, 2, 200),
    phoneDisplay: requiredText(candidate.phoneDisplay, 8, 50),
    ...(email ? { emailDisplay: email.display } : {}),
    addressText: requiredText(candidate.addressText, 5, 500),
    slug,
    regionSlug,
    serviceCategorySlugs,
    sourceType: sourceType as ApprovalSourceType,
    evidenceNote: requiredText(candidate.evidenceNote, 10, 1000),
    distinctBranchReviewed,
  };
}

function parseJson(value: string, failure: "invalid_batch" | "invalid_preflight") {
  if (Buffer.byteLength(value, "utf8") > maximumFileBytes) {
    throw new OfficeReviewBatchError(failure);
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new OfficeReviewBatchError(failure);
  }
}

export function parseOfficeReviewBatch(
  manifestText: string,
  preflightText: string,
  now = new Date(),
): OfficeReviewBatch {
  const manifest = asRecord(parseJson(manifestText, "invalid_batch"));
  if (manifest.version !== 1 || !Array.isArray(manifest.candidates)) {
    throw new OfficeReviewBatchError("invalid_batch");
  }
  if (
    manifest.candidates.length === 0 ||
    manifest.candidates.length > maximumBatchSize
  ) {
    throw new OfficeReviewBatchError("batch_too_large");
  }

  const batchId = requiredText(manifest.batchId, 3, 100);
  const verifiedAt = requiredText(manifest.verifiedAt, 10, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) {
    throw new OfficeReviewBatchError("invalid_batch");
  }
  const candidates = manifest.candidates.map(parseCandidate);
  const uniqueSlugs = new Set(candidates.map((item) => item.slug));
  const uniqueSourceAddresses = new Set(
    candidates.map((item) => `${item.sourceUrl}\n${item.addressText}`),
  );
  const sourceCounts = new Map<string, number>();
  for (const candidate of candidates) {
    sourceCounts.set(
      candidate.sourceUrl,
      (sourceCounts.get(candidate.sourceUrl) ?? 0) + 1,
    );
  }
  if (
    uniqueSlugs.size !== candidates.length ||
    uniqueSourceAddresses.size !== candidates.length ||
    candidates.some(
      (candidate) =>
        (sourceCounts.get(candidate.sourceUrl) ?? 0) > 1 &&
        !candidate.distinctBranchReviewed,
    )
  ) {
    throw new OfficeReviewBatchError("duplicate_candidate");
  }

  let preflightValue: unknown;
  try {
    preflightValue = parseJson(preflightText, "invalid_preflight");
  } catch (error) {
    if (error instanceof OfficeReviewBatchError) {
      throw error;
    }
    throw new OfficeReviewBatchError("invalid_preflight");
  }
  let preflight: Record<string, unknown>;
  try {
    preflight = asRecord(preflightValue);
  } catch {
    throw new OfficeReviewBatchError("invalid_preflight");
  }
  if (
    preflight.version !== 1 ||
    preflight.batchId !== batchId ||
    preflight.verifiedAt !== verifiedAt ||
    !Array.isArray(preflight.results)
  ) {
    throw new OfficeReviewBatchError("invalid_preflight");
  }

  const checkedAt = new Date(
    requiredText(preflight.checkedAt, 10, 100, "invalid_preflight"),
  );
  const age = now.getTime() - checkedAt.getTime();
  if (
    Number.isNaN(checkedAt.getTime()) ||
    age < -5 * 60_000 ||
    age > maximumPreflightAgeMilliseconds
  ) {
    throw new OfficeReviewBatchError("preflight_expired");
  }

  const resultBySlug = new Map<string, Record<string, unknown>>();
  const candidatesBySource = new Map<string, OfficeBatchCandidate[]>();
  for (const candidate of candidates) {
    candidatesBySource.set(candidate.sourceUrl, [
      ...(candidatesBySource.get(candidate.sourceUrl) ?? []),
      candidate,
    ]);
  }
  for (const rawResult of preflight.results) {
    let result: Record<string, unknown>;
    try {
      result = asRecord(rawResult);
    } catch {
      throw new OfficeReviewBatchError("invalid_preflight");
    }
    const sourceUrl = requiredText(
      result.sourceUrl,
      8,
      2048,
      "invalid_preflight",
    );
    const sourceCandidates = candidatesBySource.get(sourceUrl) ?? [];
    const slug =
      typeof result.slug === "string"
        ? requiredText(result.slug, 3, 80, "invalid_preflight")
        : sourceCandidates.length === 1
          ? sourceCandidates.at(0)?.slug
          : undefined;
    if (
      !slug ||
      !sourceCandidates.some((candidate) => candidate.slug === slug)
    ) {
      throw new OfficeReviewBatchError("invalid_preflight");
    }
    if (resultBySlug.has(slug)) {
      throw new OfficeReviewBatchError("invalid_preflight");
    }
    resultBySlug.set(slug, result);
  }
  if (
    candidates.some(
      (candidate) =>
        resultBySlug.get(candidate.slug)?.eligibleForManualIntake !== true,
    )
  ) {
    throw new OfficeReviewBatchError("preflight_failed");
  }

  return { batchId, verifiedAt, candidates };
}

export async function createOfficeReviewBatch(input: {
  actorId: string;
  manifestText: string;
  preflightText: string;
  officialSourceConfirmed: boolean;
  sensitiveContentConfirmed: boolean;
}) {
  if (!input.officialSourceConfirmed || !input.sensitiveContentConfirmed) {
    throw new OfficeReviewBatchError("confirmation_required");
  }
  const batch = parseOfficeReviewBatch(input.manifestText, input.preflightText);
  const results: Array<{
    slug: string;
    reviewItemId: string | null;
    outcome: "created" | "existing" | "published";
  }> = [];

  for (const candidate of batch.candidates) {
    const db = getDatabase();
    const publishedResult = await db.execute<{
      name: string;
      phone_display: string;
      address_text: string;
      region_slug: string;
      source_url: string;
      category_slugs: string[];
    }>(sql`
      select ${offices.name} as name,
             ${offices.phoneDisplay} as phone_display,
             ${offices.addressText} as address_text,
             ${regions.slug} as region_slug,
             ${officeSources.url} as source_url,
             coalesce(array_agg(distinct ${serviceCategories.slug})
               filter (where ${serviceCategories.slug} is not null), '{}')
               as category_slugs
      from ${offices}
      join ${regions} on ${regions.id} = ${offices.regionId}
      join ${officeSources} on ${officeSources.officeId} = ${offices.id}
        and ${officeSources.isPrimary} = true
      left join ${officeServiceCategories}
        on ${officeServiceCategories.officeId} = ${offices.id}
      left join ${serviceCategories}
        on ${serviceCategories.id} = ${officeServiceCategories.serviceCategoryId}
      where ${offices.slug} = ${candidate.slug}
        and ${offices.status} = 'published'
      group by ${offices.id}, ${regions.slug}, ${officeSources.url}
    `);
    const published = publishedResult.rows[0];
    if (published) {
      if (
        published.name !== candidate.name ||
        published.phone_display !== candidate.phoneDisplay ||
        published.address_text !== candidate.addressText ||
        published.region_slug !== candidate.regionSlug ||
        published.source_url !== candidate.sourceUrl ||
        JSON.stringify([...published.category_slugs].sort()) !==
          JSON.stringify([...candidate.serviceCategorySlugs].sort())
      ) {
        throw new OfficeReviewBatchError("duplicate_candidate");
      }
      results.push({
        slug: candidate.slug,
        reviewItemId: null,
        outcome: "published",
      });
      continue;
    }
    try {
      const created = await createManualOfficeCandidate({
        actorId: input.actorId,
        sourceUrl: candidate.sourceUrl,
        name: candidate.name,
        phoneDisplay: candidate.phoneDisplay,
        emailDisplay: candidate.emailDisplay,
        addressText: candidate.addressText,
        officialSourceConfirmed: true,
        sensitiveContentConfirmed: true,
        batch: {
          batchId: batch.batchId,
          slug: candidate.slug,
          regionSlug: candidate.regionSlug,
          serviceCategorySlugs: candidate.serviceCategorySlugs,
          sourceType: candidate.sourceType,
          evidenceNote: candidate.evidenceNote,
          distinctBranchReviewed: candidate.distinctBranchReviewed,
        },
      });
      results.push({
        slug: candidate.slug,
        reviewItemId: created.reviewItemId,
        outcome: "created",
      });
    } catch (error) {
      if (
        error instanceof ManualOfficeCandidateError &&
        error.reason === "duplicate" &&
        error.existingReviewItemId
      ) {
        const db = getDatabase();
        const [existing] = await db
          .select({
            status: reviewItems.status,
            proposedValues: reviewItems.proposedValues,
          })
          .from(reviewItems)
          .where(eq(reviewItems.id, error.existingReviewItemId))
          .limit(1);
        const proposed = existing
          ? asRecord(existing.proposedValues)
          : undefined;
        if (
          !existing ||
          !proposed ||
          (existing.status !== "pending" && existing.status !== "on_hold") ||
          proposed.name !== candidate.name ||
          proposed.phoneNormalized !==
            normalizeDomesticPhoneDigits(candidate.phoneDisplay) ||
          proposed.addressText !== candidate.addressText
        ) {
          throw new OfficeReviewBatchError("duplicate_candidate");
        }
        await db
          .update(reviewItems)
          .set({
            cause: "manual_official_source_batch",
            proposedValues: {
              ...proposed,
              batchId: batch.batchId,
              slug: candidate.slug,
              regionSlug: candidate.regionSlug,
              serviceCategorySlugs: candidate.serviceCategorySlugs,
              sourceType: candidate.sourceType,
              evidenceNote: candidate.evidenceNote,
              distinctBranchReviewed: candidate.distinctBranchReviewed,
            },
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(reviewItems.id, error.existingReviewItemId),
              inArray(reviewItems.status, ["pending", "on_hold"]),
            ),
          );
        results.push({
          slug: candidate.slug,
          reviewItemId: error.existingReviewItemId,
          outcome: "existing",
        });
        continue;
      }
      throw error;
    }
  }

  return { batchId: batch.batchId, results };
}

type BatchReviewRow = {
  id: string;
  status: string;
  updatedAt: Date;
  proposedValues: unknown;
  sourceUrl: string;
  officeSlug: string | null;
  officeName: string | null;
};

function metadataFromProposed(value: unknown): NewOfficeMetadata & {
  batchId: string;
  evidenceNote: string;
  name: string;
  phoneDisplay: string;
  addressText: string;
} {
  const proposed = asRecord(value);
  const sourceType = requiredText(proposed.sourceType, 1, 100);
  if (!approvalSourceTypes.includes(sourceType as ApprovalSourceType)) {
    throw new OfficeReviewBatchError("invalid_batch");
  }
  if (!Array.isArray(proposed.serviceCategorySlugs)) {
    throw new OfficeReviewBatchError("invalid_batch");
  }
  return {
    batchId: requiredText(proposed.batchId, 3, 100),
    slug: requiredText(proposed.slug, 3, 80),
    regionSlug: requiredText(proposed.regionSlug, 1, 100),
    serviceCategorySlugs: proposed.serviceCategorySlugs.map((item) =>
      requiredText(item, 1, 100),
    ),
    sourceType: sourceType as ApprovalSourceType,
    evidenceNote: requiredText(proposed.evidenceNote, 10, 1000),
    name: requiredText(proposed.name, 2, 200),
    phoneDisplay: requiredText(proposed.phoneDisplay, 8, 50),
    addressText: requiredText(proposed.addressText, 5, 500),
  };
}

export async function listOfficeReviewBatch(batchId: string) {
  const normalizedBatchId = requiredText(batchId, 3, 100);
  const db = getDatabase();
  const rows = await db
    .select({
      id: reviewItems.id,
      status: reviewItems.status,
      updatedAt: reviewItems.updatedAt,
      proposedValues: reviewItems.proposedValues,
      sourceUrl: collectedRecords.sourceUrl,
      officeSlug: offices.slug,
      officeName: offices.name,
    })
    .from(reviewItems)
    .innerJoin(
      collectedRecords,
      eq(reviewItems.collectedRecordId, collectedRecords.id),
    )
    .leftJoin(offices, eq(reviewItems.officeId, offices.id))
    .where(
      and(
        eq(reviewItems.type, "new_office"),
        eq(reviewItems.cause, "manual_official_source_batch"),
        sql`${reviewItems.proposedValues}->>'batchId' = ${normalizedBatchId}`,
      ),
    )
    .orderBy(asc(reviewItems.createdAt), asc(reviewItems.id));

  return rows.map((row: BatchReviewRow) => ({
    ...row,
    metadata: metadataFromProposed(row.proposedValues),
  }));
}

export async function approveOfficeReviewBatch(input: {
  batchId: string;
  reviewItemIds: string[];
  actorId: string;
  reason: string;
  reviewedValuesConfirmed: boolean;
}) {
  if (!input.reviewedValuesConfirmed) {
    throw new OfficeReviewBatchError("confirmation_required");
  }
  if (
    !input.actorId.trim() ||
    input.reason.trim().length < 5 ||
    input.reason.trim().length > 1000
  ) {
    throw new OfficeReviewBatchError("invalid_batch");
  }
  const selectedIds = [...new Set(input.reviewItemIds)];
  if (selectedIds.length === 0) {
    throw new OfficeReviewBatchError("no_candidate_selected");
  }
  if (selectedIds.length > maximumBatchSize) {
    throw new OfficeReviewBatchError("batch_too_large");
  }
  const rows = await listOfficeReviewBatch(input.batchId);
  if (rows.length === 0) {
    throw new OfficeReviewBatchError("batch_not_found");
  }
  const rowById = new Map(rows.map((row) => [row.id, row]));
  if (selectedIds.some((id) => !rowById.has(id))) {
    throw new OfficeReviewBatchError("candidate_not_in_batch");
  }

  const approved: Array<{ reviewItemId: string; slug: string }> = [];
  const failed: Array<{ reviewItemId: string; reason: string }> = [];
  for (const reviewItemId of selectedIds) {
    const row = rowById.get(reviewItemId);
    if (!row || (row.status !== "pending" && row.status !== "on_hold")) {
      failed.push({ reviewItemId, reason: "invalid_review_item" });
      continue;
    }
    try {
      const result = await approveReview({
        reviewItemId,
        actorId: input.actorId,
        reason: input.reason,
        decision: "approved",
        expectedReviewUpdatedAt: row.updatedAt,
        newOffice: {
          slug: row.metadata.slug,
          regionSlug: row.metadata.regionSlug,
          serviceCategorySlugs: row.metadata.serviceCategorySlugs,
          sourceType: row.metadata.sourceType,
        },
      });
      approved.push({ reviewItemId, slug: result.slug });
    } catch (error) {
      if (!(error instanceof ReviewApprovalError)) {
        throw error;
      }
      failed.push({
        reviewItemId,
        reason: error.reason,
      });
    }
  }
  return { approved, failed };
}

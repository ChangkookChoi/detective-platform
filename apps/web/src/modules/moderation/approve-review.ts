import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  collectedRecords,
  officeServiceCategories,
  officeSourceEvidence,
  officeSources,
  offices,
  regions,
  reviewActions,
  reviewItems,
  serviceCategories,
} from "@/db/schema";
import { normalizeDomesticPhoneDigits } from "@/modules/shared/domestic-phone";
import { normalizeOptionalBusinessEmail } from "@/modules/shared/business-email";
import { isPublicHttpUrl } from "@/modules/shared/public-url";

export const approvalDecisions = ["approved", "approved_with_edits"] as const;
export type ApprovalDecision = (typeof approvalDecisions)[number];

export const approvalSourceTypes = [
  "official_website",
  "public_data",
  "official_social",
  "manual_submission",
  "other_public_source",
] as const;
export type ApprovalSourceType = (typeof approvalSourceTypes)[number];

export type ApprovalFailure =
  | "archived_office"
  | "concurrent_change"
  | "inactive_category"
  | "inactive_region"
  | "invalid_edited_values"
  | "invalid_proposed_values"
  | "invalid_review_item"
  | "invalid_slug"
  | "invalid_source_type"
  | "invalid_source_url"
  | "missing_category"
  | "missing_collection"
  | "missing_evidence"
  | "missing_fields"
  | "missing_primary_source"
  | "office_not_found"
  | "region_not_leaf"
  | "restricted_office_status"
  | "slug_conflict"
  | "source_already_assigned"
  | "source_mismatch"
  | "unsupported_review_type";

export class ReviewApprovalError extends Error {
  constructor(public readonly reason: ApprovalFailure) {
    super(`Review approval failed: ${reason}`);
    this.name = "ReviewApprovalError";
  }
}

export type EditableOfficeValues = {
  name: string;
  summary: string;
  phoneDisplay: string;
  emailDisplay?: string;
  addressText: string;
};

export type NewOfficeMetadata = {
  slug: string;
  regionSlug: string;
  serviceCategorySlugs: string[];
  sourceType: string;
};

export type CorrectionSourceMetadata = {
  url: string;
  sourceType: string;
};

type ApproveReviewInput = {
  reviewItemId: string;
  actorId: string;
  reason: string;
  decision: ApprovalDecision;
  expectedReviewUpdatedAt: Date;
  expectedOfficeUpdatedAt?: Date;
  editedValues?: EditableOfficeValues;
  newOffice?: NewOfficeMetadata;
  correctionSource?: CorrectionSourceMetadata;
};

type OfficeSnapshot = {
  id: string;
  status: "archived" | "closed_suspected" | "draft" | "published" | "suspended";
  slug: string;
  name: string;
  summary: string | null;
  phone_normalized: string | null;
  phone_display: string | null;
  email_normalized: string | null;
  email_display: string | null;
  email_kind: "generic_business" | "unknown" | null;
  address_text: string | null;
  region_id: string;
  published_at: Date | null;
  updated_at: Date;
};

type AcceptedValues = {
  name: string;
  summary: string | null;
  phoneNormalized: string;
  phoneDisplay: string;
  emailNormalized: string | null;
  emailDisplay: string | null;
  emailKind: "generic_business" | "unknown" | null;
  addressText: string;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeRequiredText(
  value: unknown,
  maxLength: number,
  failure: "invalid_edited_values" | "invalid_proposed_values",
) {
  if (typeof value !== "string") {
    throw new ReviewApprovalError(failure);
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized || normalized.length > maxLength) {
    throw new ReviewApprovalError(failure);
  }

  return normalized;
}

function normalizeSummary(
  value: unknown,
  failure: "invalid_edited_values" | "invalid_proposed_values",
) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ReviewApprovalError(failure);
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length > 2000) {
    throw new ReviewApprovalError(failure);
  }

  return normalized || null;
}

function normalizePhone(
  value: unknown,
  failure: "invalid_edited_values" | "invalid_proposed_values",
) {
  const display = normalizeRequiredText(value, 50, failure);
  const normalized = normalizeDomesticPhoneDigits(display);

  if (!normalized) {
    throw new ReviewApprovalError(failure);
  }

  return { display, normalized };
}

function includesPhone(values: Record<string, unknown>) {
  return "phoneDisplay" in values || "phoneNormalized" in values;
}

function includesEmail(values: Record<string, unknown>) {
  return "emailDisplay" in values || "emailNormalized" in values;
}

function normalizeBusinessEmail(
  value: unknown,
  failure: "invalid_edited_values" | "invalid_proposed_values",
) {
  try {
    return normalizeOptionalBusinessEmail(value);
  } catch {
    throw new ReviewApprovalError(failure);
  }
}

function buildAcceptedValues(
  proposed: Record<string, unknown>,
  office: OfficeSnapshot | null,
  decision: ApprovalDecision,
  editedValues: EditableOfficeValues | undefined,
) {
  const failure =
    decision === "approved"
      ? "invalid_proposed_values"
      : "invalid_edited_values";
  const isNew = office === null;
  const edits = decision === "approved_with_edits" ? editedValues : undefined;

  if (decision === "approved_with_edits" && !edits) {
    throw new ReviewApprovalError("invalid_edited_values");
  }

  const nameSource =
    edits && (isNew || "name" in proposed)
      ? edits.name
      : "name" in proposed
        ? proposed.name
        : office?.name;
  const phoneSource =
    edits && (isNew || includesPhone(proposed))
      ? edits.phoneDisplay
      : "phoneDisplay" in proposed
        ? proposed.phoneDisplay
        : office?.phone_display;
  const addressSource =
    edits && (isNew || "addressText" in proposed)
      ? edits.addressText
      : "addressText" in proposed
        ? proposed.addressText
        : office?.address_text;
  const emailSource =
    edits && (isNew || includesEmail(proposed))
      ? edits.emailDisplay
      : "emailDisplay" in proposed
        ? proposed.emailDisplay
        : office?.email_display;
  const summarySource =
    edits && (isNew || "summary" in proposed)
      ? edits.summary
      : "summary" in proposed
        ? proposed.summary
        : office?.summary;

  const name = normalizeRequiredText(nameSource, 200, failure);
  const phone = normalizePhone(phoneSource, failure);
  const email = normalizeBusinessEmail(emailSource, failure);
  const addressText = normalizeRequiredText(addressSource, 500, failure);
  const summary = normalizeSummary(summarySource, failure);

  if (
    decision === "approved" &&
    typeof proposed.phoneNormalized === "string" &&
    proposed.phoneNormalized !== phone.normalized
  ) {
    throw new ReviewApprovalError("invalid_proposed_values");
  }
  if (
    decision === "approved" &&
    typeof proposed.emailNormalized === "string" &&
    proposed.emailNormalized !== email?.normalized
  ) {
    throw new ReviewApprovalError("invalid_proposed_values");
  }

  return {
    name,
    summary,
    phoneNormalized: phone.normalized,
    phoneDisplay: phone.display,
    emailNormalized: email?.normalized ?? null,
    emailDisplay: email?.display ?? null,
    emailKind: email?.kind ?? null,
    addressText,
  } satisfies AcceptedValues;
}

function validateNewOfficeMetadata(value: NewOfficeMetadata | undefined) {
  if (!value) {
    throw new ReviewApprovalError("invalid_edited_values");
  }

  const slug = value.slug.trim().toLowerCase();
  const regionSlug = value.regionSlug.trim();
  const categorySlugs = [
    ...new Set(value.serviceCategorySlugs.map((item) => item.trim())),
  ]
    .filter(Boolean)
    .sort();

  if (slug.length < 3 || slug.length > 80 || !slugPattern.test(slug)) {
    throw new ReviewApprovalError("invalid_slug");
  }

  if (!regionSlug) {
    throw new ReviewApprovalError("inactive_region");
  }

  if (categorySlugs.length === 0) {
    throw new ReviewApprovalError("missing_category");
  }

  if (!approvalSourceTypes.includes(value.sourceType as ApprovalSourceType)) {
    throw new ReviewApprovalError("invalid_source_type");
  }

  return {
    slug,
    regionSlug,
    categorySlugs,
    sourceType: value.sourceType as ApprovalSourceType,
  };
}

function validateCorrectionSource(
  value: CorrectionSourceMetadata | undefined,
) {
  if (!value) {
    throw new ReviewApprovalError("invalid_source_url");
  }

  const url = value.url.trim();

  if (url.length > 2048 || !isPublicHttpUrl(url)) {
    throw new ReviewApprovalError("invalid_source_url");
  }

  if (!approvalSourceTypes.includes(value.sourceType as ApprovalSourceType)) {
    throw new ReviewApprovalError("invalid_source_type");
  }

  return {
    url,
    sourceType: value.sourceType as ApprovalSourceType,
  };
}

export async function approveReview(input: ApproveReviewInput) {
  const actorId = input.actorId.trim();
  const reason = input.reason.trim();

  if (
    !actorId ||
    reason.length < 5 ||
    reason.length > 1000 ||
    !approvalDecisions.includes(input.decision)
  ) {
    throw new ReviewApprovalError("invalid_review_item");
  }

  const db = getDatabase();

  return db.transaction(async (tx) => {
    const reviewResult = await tx.execute<{
      id: string;
      type: string;
      status: string;
      office_id: string | null;
      collected_record_id: string | null;
      proposed_values: unknown;
      updated_at: Date;
    }>(sql`
      select id, type, status, office_id, collected_record_id,
             proposed_values, updated_at
      from ${reviewItems}
      where ${reviewItems.id} = ${input.reviewItemId}
      for update
    `);
    const review = reviewResult.rows[0];

    if (!review) {
      throw new ReviewApprovalError("invalid_review_item");
    }

    if (
      new Date(review.updated_at).getTime() !==
      input.expectedReviewUpdatedAt.getTime()
    ) {
      throw new ReviewApprovalError("concurrent_change");
    }

    if (review.status !== "pending" && review.status !== "on_hold") {
      throw new ReviewApprovalError("invalid_review_item");
    }

    const isCorrection = review.type === "correction_request";

    if (
      review.type !== "new_office" &&
      review.type !== "field_change" &&
      !isCorrection
    ) {
      throw new ReviewApprovalError("unsupported_review_type");
    }

    let collection: {
      sourceUrl: string;
      collectedAt: Date;
      normalizedValues: unknown;
    } | null = null;

    if (!isCorrection) {
      if (!review.collected_record_id) {
        throw new ReviewApprovalError("missing_collection");
      }

      const [collected] = await tx
        .select({
          sourceUrl: collectedRecords.sourceUrl,
          collectedAt: collectedRecords.collectedAt,
          normalizedValues: collectedRecords.normalizedValues,
        })
        .from(collectedRecords)
        .where(eq(collectedRecords.id, review.collected_record_id))
        .limit(1);

      if (!collected) {
        throw new ReviewApprovalError("missing_collection");
      }

      if (!isPublicHttpUrl(collected.sourceUrl)) {
        throw new ReviewApprovalError("invalid_source_url");
      }

      collection = collected;
    }

    const proposed = asRecord(review.proposed_values);
    const normalizedCollection = collection
      ? asRecord(collection.normalizedValues)
      : null;

    if (!proposed || (!isCorrection && !normalizedCollection)) {
      throw new ReviewApprovalError("invalid_proposed_values");
    }

    let office: OfficeSnapshot | null = null;

    if (review.office_id) {
      const officeResult = await tx.execute<OfficeSnapshot>(sql`
        select id, status, slug, name, summary, phone_normalized,
               phone_display, email_normalized, email_display, email_kind,
               address_text, region_id, published_at, updated_at
        from ${offices}
        where ${offices.id} = ${review.office_id}
        for update
      `);
      office = officeResult.rows[0] ?? null;

      if (!office) {
        throw new ReviewApprovalError("office_not_found");
      }

      if (
        !input.expectedOfficeUpdatedAt ||
        new Date(office.updated_at).getTime() !==
          input.expectedOfficeUpdatedAt.getTime()
      ) {
        throw new ReviewApprovalError("concurrent_change");
      }

      if (office.status === "archived") {
        throw new ReviewApprovalError("archived_office");
      }

      if (
        office.status === "suspended" ||
        office.status === "closed_suspected"
      ) {
        throw new ReviewApprovalError("restricted_office_status");
      }

      if (isCorrection && office.status !== "published") {
        throw new ReviewApprovalError("restricted_office_status");
      }
    } else if (review.type !== "new_office") {
      throw new ReviewApprovalError("office_not_found");
    }

    const accepted = buildAcceptedValues(
      proposed,
      office,
      input.decision,
      input.editedValues,
    );
    const now = new Date();
    let officeId = office?.id;
    let sourceId: string;
    let metadata: ReturnType<typeof validateNewOfficeMetadata> | null = null;
    const correctionSource = isCorrection
      ? validateCorrectionSource(input.correctionSource)
      : null;

    if (!officeId) {
      if (!collection) {
        throw new ReviewApprovalError("missing_collection");
      }

      metadata = validateNewOfficeMetadata(input.newOffice);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${collection.sourceUrl}\n${accepted.addressText}`}, 0))`,
      );

      const [sourceOwnerAtAddress] = await tx
        .select({ officeId: officeSources.officeId })
        .from(officeSources)
        .innerJoin(offices, eq(offices.id, officeSources.officeId))
        .where(
          and(
            eq(officeSources.url, collection.sourceUrl),
            eq(offices.addressText, accepted.addressText),
          ),
        )
        .limit(1);

      if (sourceOwnerAtAddress) {
        throw new ReviewApprovalError("source_already_assigned");
      }

      const [existingSlug] = await tx
        .select({ id: offices.id })
        .from(offices)
        .where(eq(offices.slug, metadata.slug))
        .limit(1);

      if (existingSlug) {
        throw new ReviewApprovalError("slug_conflict");
      }

      const [region] = await tx
        .select({ id: regions.id })
        .from(regions)
        .where(
          and(
            eq(regions.slug, metadata.regionSlug),
            eq(regions.isActive, true),
          ),
        )
        .limit(1);

      if (!region) {
        throw new ReviewApprovalError("inactive_region");
      }

      const [activeChild] = await tx
        .select({ id: regions.id })
        .from(regions)
        .where(
          and(eq(regions.parentId, region.id), eq(regions.isActive, true)),
        )
        .limit(1);

      if (activeChild) {
        throw new ReviewApprovalError("region_not_leaf");
      }

      const categoryRows = await tx
        .select({ id: serviceCategories.id, slug: serviceCategories.slug })
        .from(serviceCategories)
        .where(
          and(
            inArray(serviceCategories.slug, metadata.categorySlugs),
            eq(serviceCategories.isActive, true),
          ),
        );

      if (categoryRows.length !== metadata.categorySlugs.length) {
        throw new ReviewApprovalError("inactive_category");
      }

      const [createdOffice] = await tx
        .insert(offices)
        .values({
          slug: metadata.slug,
          name: accepted.name,
          summary: accepted.summary,
          phoneNormalized: accepted.phoneNormalized,
          phoneDisplay: accepted.phoneDisplay,
          emailNormalized: accepted.emailNormalized,
          emailDisplay: accepted.emailDisplay,
          emailKind: accepted.emailKind,
          addressText: accepted.addressText,
          regionId: region.id,
          status: "draft",
          lastVerifiedAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: offices.slug })
        .returning({ id: offices.id });

      if (!createdOffice) {
        throw new ReviewApprovalError("slug_conflict");
      }

      officeId = createdOffice.id;
      await tx.insert(officeServiceCategories).values(
        categoryRows.map((category) => ({
          officeId: createdOffice.id,
          serviceCategoryId: category.id,
        })),
      );
      const [createdSource] = await tx
        .insert(officeSources)
        .values({
          officeId: createdOffice.id,
          sourceType: metadata.sourceType,
          url: collection.sourceUrl,
          retrievedAt: collection.collectedAt,
          verifiedAt: now,
          isPrimary: true,
          accessStatus: "available",
          updatedAt: now,
        })
        .returning({ id: officeSources.id });

      if (!createdSource) {
        throw new ReviewApprovalError("missing_primary_source");
      }

      sourceId = createdSource.id;
      await tx.insert(officeSourceEvidence).values([
        { officeSourceId: sourceId, fieldName: "name", verifiedAt: now },
        { officeSourceId: sourceId, fieldName: "phone", verifiedAt: now },
        ...(accepted.emailNormalized
          ? [
              {
                officeSourceId: sourceId,
                fieldName: "email" as const,
                verifiedAt: now,
              },
            ]
          : []),
        { officeSourceId: sourceId, fieldName: "address", verifiedAt: now },
        ...(accepted.summary
          ? [
              {
                officeSourceId: sourceId,
                fieldName: "summary" as const,
                verifiedAt: now,
              },
            ]
          : []),
        ...categoryRows.map((category) => ({
          officeSourceId: sourceId,
          fieldName: "service_category" as const,
          serviceCategoryId: category.id,
          verifiedAt: now,
        })),
      ]);
    } else {
      if (correctionSource) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${officeId}:${correctionSource.url}`}, 0))`,
        );
        const [matchingSource] = await tx
          .select({ id: officeSources.id })
          .from(officeSources)
          .where(
            and(
              eq(officeSources.officeId, officeId),
              eq(officeSources.url, correctionSource.url),
            ),
          )
          .limit(1);

        if (matchingSource) {
          sourceId = matchingSource.id;
          await tx
            .update(officeSources)
            .set({
              sourceType: correctionSource.sourceType,
              retrievedAt: now,
              verifiedAt: now,
              accessStatus: "available",
              updatedAt: now,
            })
            .where(eq(officeSources.id, sourceId));
        } else {
          const [createdSource] = await tx
            .insert(officeSources)
            .values({
              officeId,
              sourceType: correctionSource.sourceType,
              url: correctionSource.url,
              retrievedAt: now,
              verifiedAt: now,
              isPrimary: false,
              accessStatus: "available",
              updatedAt: now,
            })
            .onConflictDoNothing({
              target: [officeSources.officeId, officeSources.url],
            })
            .returning({ id: officeSources.id });

          if (!createdSource) {
            throw new ReviewApprovalError("concurrent_change");
          }

          sourceId = createdSource.id;
        }
      } else {
        if (!collection) {
          throw new ReviewApprovalError("missing_collection");
        }

        const [matchingSource] = await tx
          .select({ id: officeSources.id })
          .from(officeSources)
          .where(
            and(
              eq(officeSources.officeId, officeId),
              eq(officeSources.url, collection.sourceUrl),
            ),
          )
          .limit(1);

        if (!matchingSource) {
          throw new ReviewApprovalError("source_mismatch");
        }

        sourceId = matchingSource.id;
        await tx
          .update(officeSources)
          .set({
            retrievedAt: collection.collectedAt,
            verifiedAt: now,
            accessStatus: "available",
            updatedAt: now,
          })
          .where(eq(officeSources.id, sourceId));
      }

      await tx
        .update(offices)
        .set({
          name: accepted.name,
          summary: accepted.summary,
          phoneNormalized: accepted.phoneNormalized,
          phoneDisplay: accepted.phoneDisplay,
          emailNormalized: accepted.emailNormalized,
          emailDisplay: accepted.emailDisplay,
          emailKind: accepted.emailKind,
          addressText: accepted.addressText,
          lastVerifiedAt: now,
          updatedAt: now,
        })
        .where(eq(offices.id, officeId));

      const evidenceSource = isCorrection ? proposed : normalizedCollection;

      if (!evidenceSource) {
        throw new ReviewApprovalError("invalid_proposed_values");
      }

      const supportedEvidence = [
        typeof evidenceSource.name === "string" ? "name" : null,
        typeof evidenceSource.phoneDisplay === "string" ||
        typeof evidenceSource.phoneNormalized === "string"
          ? "phone"
          : null,
        accepted.emailNormalized &&
        (typeof evidenceSource.emailDisplay === "string" ||
          typeof evidenceSource.emailNormalized === "string")
          ? "email"
          : null,
        typeof evidenceSource.addressText === "string" ? "address" : null,
        typeof evidenceSource.summary === "string" ? "summary" : null,
      ].filter(
        (field): field is "name" | "phone" | "email" | "address" | "summary" =>
          field !== null,
      );

      for (const fieldName of supportedEvidence) {
        const [existingEvidence] = await tx
          .select({ id: officeSourceEvidence.id })
          .from(officeSourceEvidence)
          .where(
            and(
              eq(officeSourceEvidence.officeSourceId, sourceId),
              eq(officeSourceEvidence.fieldName, fieldName),
            ),
          )
          .limit(1);

        if (existingEvidence) {
          await tx
            .update(officeSourceEvidence)
            .set({ verifiedAt: now, updatedAt: now })
            .where(eq(officeSourceEvidence.id, existingEvidence.id));
        } else {
          await tx.insert(officeSourceEvidence).values({
            officeSourceId: sourceId,
            fieldName,
            verifiedAt: now,
          });
        }
      }
    }

    if (!officeId) {
      throw new ReviewApprovalError("office_not_found");
    }

    const [publicationOffice] = await tx
      .select({
        status: offices.status,
        name: offices.name,
        phoneNormalized: offices.phoneNormalized,
        phoneDisplay: offices.phoneDisplay,
        addressText: offices.addressText,
        regionId: offices.regionId,
        publishedAt: offices.publishedAt,
        lastVerifiedAt: offices.lastVerifiedAt,
      })
      .from(offices)
      .where(eq(offices.id, officeId))
      .limit(1);

    if (!publicationOffice) {
      throw new ReviewApprovalError("office_not_found");
    }

    if (publicationOffice.status === "archived") {
      throw new ReviewApprovalError("archived_office");
    }

    if (
      !publicationOffice.name.trim() ||
      !publicationOffice.phoneNormalized?.trim() ||
      !publicationOffice.phoneDisplay?.trim() ||
      !publicationOffice.addressText?.trim() ||
      !publicationOffice.lastVerifiedAt
    ) {
      throw new ReviewApprovalError("missing_fields");
    }

    const [activeRegion] = await tx
      .select({ id: regions.id })
      .from(regions)
      .where(
        and(
          eq(regions.id, publicationOffice.regionId),
          eq(regions.isActive, true),
        ),
      )
      .limit(1);

    if (!activeRegion) {
      throw new ReviewApprovalError("inactive_region");
    }

    const categoryRows = await tx
      .select({
        id: serviceCategories.id,
        isActive: serviceCategories.isActive,
      })
      .from(officeServiceCategories)
      .innerJoin(
        serviceCategories,
        eq(officeServiceCategories.serviceCategoryId, serviceCategories.id),
      )
      .where(eq(officeServiceCategories.officeId, officeId));

    if (categoryRows.length === 0) {
      throw new ReviewApprovalError("missing_category");
    }

    if (categoryRows.some((category) => !category.isActive)) {
      throw new ReviewApprovalError("inactive_category");
    }

    const [primarySource] = await tx
      .select({ id: officeSources.id, url: officeSources.url })
      .from(officeSources)
      .where(
        and(
          eq(officeSources.officeId, officeId),
          eq(officeSources.isPrimary, true),
          eq(officeSources.accessStatus, "available"),
          sql`${officeSources.verifiedAt} is not null`,
        ),
      )
      .limit(1);

    if (!primarySource) {
      throw new ReviewApprovalError("missing_primary_source");
    }

    if (!isPublicHttpUrl(primarySource.url)) {
      throw new ReviewApprovalError("invalid_source_url");
    }

    const sourceRows = await tx
      .select({ id: officeSources.id, url: officeSources.url })
      .from(officeSources)
      .where(
        and(
          eq(officeSources.officeId, officeId),
          eq(officeSources.accessStatus, "available"),
          sql`${officeSources.verifiedAt} is not null`,
        ),
      );
    const sourceIds = sourceRows
      .filter((source) => isPublicHttpUrl(source.url))
      .map((source) => source.id);
    const evidenceRows = await tx
      .select({
        fieldName: officeSourceEvidence.fieldName,
        serviceCategoryId: officeSourceEvidence.serviceCategoryId,
      })
      .from(officeSourceEvidence)
      .where(inArray(officeSourceEvidence.officeSourceId, sourceIds));
    const evidenceFields = new Set(
      evidenceRows.map((evidence) => evidence.fieldName),
    );
    const evidencedCategories = new Set(
      evidenceRows
        .filter((evidence) => evidence.fieldName === "service_category")
        .map((evidence) => evidence.serviceCategoryId),
    );

    if (
      !evidenceFields.has("name") ||
      !evidenceFields.has("phone") ||
      !evidenceFields.has("address") ||
      categoryRows.some((category) => !evidencedCategories.has(category.id))
    ) {
      throw new ReviewApprovalError("missing_evidence");
    }

    const editedAuditValues =
      input.decision === "approved_with_edits"
        ? {
            name: accepted.name,
            summary: accepted.summary,
            phoneNormalized: accepted.phoneNormalized,
            phoneDisplay: accepted.phoneDisplay,
            ...(includesEmail(proposed) || office?.email_normalized
              ? {
                  emailNormalized: accepted.emailNormalized,
                  emailDisplay: accepted.emailDisplay,
                  emailKind: accepted.emailKind,
                }
              : {}),
            addressText: accepted.addressText,
            ...(metadata
              ? {
                  slug: metadata.slug,
                  regionSlug: metadata.regionSlug,
                  serviceCategorySlugs: metadata.categorySlugs,
                  sourceType: metadata.sourceType,
                }
              : {}),
            ...(correctionSource
              ? {
                  correctionSourceUrl: correctionSource.url,
                  correctionSourceType: correctionSource.sourceType,
                }
              : {}),
          }
        : correctionSource
          ? {
              correctionSourceUrl: correctionSource.url,
              correctionSourceType: correctionSource.sourceType,
            }
          : null;

    await tx.insert(reviewActions).values({
      reviewItemId: input.reviewItemId,
      actorId,
      decision: input.decision,
      editedValues: editedAuditValues,
      reason,
    });
    await tx
      .update(reviewItems)
      .set({
        officeId,
        status: input.decision,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(reviewItems.id, input.reviewItemId));
    const [publishedOffice] = await tx
      .update(offices)
      .set({
        status: "published",
        publishedAt: publicationOffice.publishedAt ?? now,
        updatedAt: now,
      })
      .where(eq(offices.id, officeId))
      .returning({
        id: offices.id,
        slug: offices.slug,
        status: offices.status,
        publishedAt: offices.publishedAt,
        updatedAt: offices.updatedAt,
      });

    if (!publishedOffice) {
      throw new ReviewApprovalError("office_not_found");
    }

    return { ...publishedOffice, decision: input.decision };
  });
}

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  officeServiceCategories,
  officeSourceEvidence,
  officeSources,
  offices,
  regions,
  reviewActions,
  reviewItems,
  serviceCategories,
} from "@/db/schema";
import { isPublicHttpUrl } from "@/modules/shared/public-url";

export type PublicationFailure =
  | "archived_office"
  | "concurrent_change"
  | "inactive_category"
  | "inactive_region"
  | "invalid_source_url"
  | "invalid_review_item"
  | "missing_category"
  | "missing_evidence"
  | "missing_fields"
  | "missing_primary_source"
  | "office_not_found";

export class OfficePublicationError extends Error {
  constructor(public readonly reason: PublicationFailure) {
    super(`Office publication failed: ${reason}`);
    this.name = "OfficePublicationError";
  }
}

type PublishOfficeInput = {
  officeId: string;
  reviewItemId: string;
  actorId: string;
  reason: string;
  expectedUpdatedAt: Date;
};

export async function publishOffice(input: PublishOfficeInput) {
  if (input.actorId.trim().length === 0 || input.reason.trim().length === 0) {
    throw new OfficePublicationError("invalid_review_item");
  }

  const db = getDatabase();

  return db.transaction(async (tx) => {
    const officeResult = await tx.execute<{
      id: string;
      status: "archived" | "closed_suspected" | "draft" | "published" | "suspended";
      name: string;
      phone_normalized: string | null;
      phone_display: string | null;
      address_text: string | null;
      region_id: string;
      last_verified_at: Date | null;
      published_at: Date | null;
      updated_at: Date;
    }>(sql`
      select id, status, name, phone_normalized, phone_display, address_text,
             region_id, last_verified_at, published_at, updated_at
      from ${offices}
      where ${offices.id} = ${input.officeId}
      for update
    `);
    const office = officeResult.rows[0];

    if (!office) {
      throw new OfficePublicationError("office_not_found");
    }

    if (office.status === "archived") {
      throw new OfficePublicationError("archived_office");
    }

    const officeUpdatedAt = new Date(office.updated_at);
    const officePublishedAt = office.published_at
      ? new Date(office.published_at)
      : null;

    if (officeUpdatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      throw new OfficePublicationError("concurrent_change");
    }

    if (
      office.name.trim().length === 0 ||
      !office.phone_normalized?.trim() ||
      !office.phone_display?.trim() ||
      !office.address_text?.trim() ||
      !office.last_verified_at
    ) {
      throw new OfficePublicationError("missing_fields");
    }

    const [reviewItem] = await tx
      .select({ id: reviewItems.id })
      .from(reviewItems)
      .where(
        and(
          eq(reviewItems.id, input.reviewItemId),
          eq(reviewItems.officeId, input.officeId),
          eq(reviewItems.status, "pending"),
        ),
      )
      .limit(1);

    if (!reviewItem) {
      throw new OfficePublicationError("invalid_review_item");
    }

    const [region] = await tx
      .select({ isActive: regions.isActive })
      .from(regions)
      .where(eq(regions.id, office.region_id))
      .limit(1);

    if (!region?.isActive) {
      throw new OfficePublicationError("inactive_region");
    }

    const categoryRows = await tx
      .select({
        id: serviceCategories.id,
        isActive: serviceCategories.isActive,
      })
      .from(officeServiceCategories)
      .innerJoin(
        serviceCategories,
        eq(
          officeServiceCategories.serviceCategoryId,
          serviceCategories.id,
        ),
      )
      .where(eq(officeServiceCategories.officeId, input.officeId));

    if (categoryRows.length === 0) {
      throw new OfficePublicationError("missing_category");
    }

    if (categoryRows.some((category) => !category.isActive)) {
      throw new OfficePublicationError("inactive_category");
    }

    const [primarySource] = await tx
      .select({ id: officeSources.id, url: officeSources.url })
      .from(officeSources)
      .where(
        and(
          eq(officeSources.officeId, input.officeId),
          eq(officeSources.isPrimary, true),
          eq(officeSources.accessStatus, "available"),
          sql`${officeSources.verifiedAt} is not null`,
        ),
      )
      .limit(1);

    if (!primarySource) {
      throw new OfficePublicationError("missing_primary_source");
    }

    if (!isPublicHttpUrl(primarySource.url)) {
      throw new OfficePublicationError("invalid_source_url");
    }

    const sourceRows = await tx
      .select({ id: officeSources.id, url: officeSources.url })
      .from(officeSources)
      .where(
        and(
          eq(officeSources.officeId, input.officeId),
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
      throw new OfficePublicationError("missing_evidence");
    }

    const now = new Date();

    await tx.insert(reviewActions).values({
      reviewItemId: input.reviewItemId,
      actorId: input.actorId,
      decision: "approved",
      reason: input.reason,
    });
    await tx
      .update(reviewItems)
      .set({ status: "approved", resolvedAt: now, updatedAt: now })
      .where(eq(reviewItems.id, input.reviewItemId));
    const [publishedOffice] = await tx
      .update(offices)
      .set({
        status: "published",
        publishedAt: officePublishedAt ?? now,
        updatedAt: now,
      })
      .where(eq(offices.id, input.officeId))
      .returning({
        id: offices.id,
        status: offices.status,
        publishedAt: offices.publishedAt,
        updatedAt: offices.updatedAt,
      });

    if (!publishedOffice) {
      throw new OfficePublicationError("office_not_found");
    }

    return publishedOffice;
  });
}

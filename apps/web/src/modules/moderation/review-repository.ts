import { asc, desc, eq, sql } from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  collectedRecords,
  officeServiceCategories,
  officeSources,
  offices,
  regions,
  reviewActions,
  reviewItems,
  serviceCategories,
} from "@/db/schema";
import { isPublicHttpUrl } from "@/modules/shared/public-url";

const reviewStatuses = [
  "pending",
  "on_hold",
  "approved",
  "approved_with_edits",
  "rejected",
] as const;

export type ReviewQueueStatus = (typeof reviewStatuses)[number];

export type ReviewQueueItem = {
  id: string;
  type: string;
  risk: string;
  status: ReviewQueueStatus;
  cause: string;
  createdAt: Date;
  updatedAt: Date;
  office: {
    id: string;
    slug: string;
    name: string;
    status: string;
  } | null;
};

export class ReviewQueueFilterError extends Error {
  constructor(public readonly field: "status") {
    super(`Unsupported review queue filter: ${field}`);
    this.name = "ReviewQueueFilterError";
  }
}

function isReviewQueueStatus(value: string): value is ReviewQueueStatus {
  return reviewStatuses.includes(value as ReviewQueueStatus);
}

export async function listReviewQueue(status = "pending") {
  if (!isReviewQueueStatus(status)) {
    throw new ReviewQueueFilterError("status");
  }

  const db = getDatabase();
  const riskOrder = sql<number>`case ${reviewItems.risk}
    when 'high' then 0
    when 'medium' then 1
    else 2
  end`;
  const rows = await db
    .select({
      id: reviewItems.id,
      type: reviewItems.type,
      risk: reviewItems.risk,
      status: reviewItems.status,
      cause: reviewItems.cause,
      createdAt: reviewItems.createdAt,
      updatedAt: reviewItems.updatedAt,
      officeId: offices.id,
      officeSlug: offices.slug,
      officeName: offices.name,
      officeStatus: offices.status,
    })
    .from(reviewItems)
    .leftJoin(offices, eq(reviewItems.officeId, offices.id))
    .where(eq(reviewItems.status, status))
    .orderBy(asc(riskOrder), asc(reviewItems.createdAt), asc(reviewItems.id));

  return rows.map(
    (row): ReviewQueueItem => ({
      id: row.id,
      type: row.type,
      risk: row.risk,
      status: row.status,
      cause: row.cause,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      office:
        row.officeId && row.officeSlug && row.officeName && row.officeStatus
          ? {
              id: row.officeId,
              slug: row.officeSlug,
              name: row.officeName,
              status: row.officeStatus,
            }
          : null,
    }),
  );
}

export async function listReviewFormOptions() {
  const db = getDatabase();
  const [regionRows, categoryRows] = await Promise.all([
    db
      .select({
        id: regions.id,
        parentId: regions.parentId,
        slug: regions.slug,
        name: regions.name,
        displayOrder: regions.displayOrder,
      })
      .from(regions)
      .where(eq(regions.isActive, true))
      .orderBy(asc(regions.displayOrder), asc(regions.name)),
    db
      .select({ slug: serviceCategories.slug, name: serviceCategories.name })
      .from(serviceCategories)
      .where(eq(serviceCategories.isActive, true))
      .orderBy(
        asc(serviceCategories.displayOrder),
        asc(serviceCategories.name),
      ),
  ]);
  const childrenByParent = new Map<string | null, typeof regionRows>();

  for (const region of regionRows) {
    const children = childrenByParent.get(region.parentId) ?? [];
    children.push(region);
    childrenByParent.set(region.parentId, children);
  }

  const leafRegions: Array<{ slug: string; label: string }> = [];

  function appendLeafRegions(parentId: string | null, ancestors: string[]) {
    for (const region of childrenByParent.get(parentId) ?? []) {
      const path = [...ancestors, region.name];
      const children = childrenByParent.get(region.id) ?? [];

      if (children.length === 0) {
        leafRegions.push({ slug: region.slug, label: path.join(" / ") });
      } else {
        appendLeafRegions(region.id, path);
      }
    }
  }

  appendLeafRegions(null, []);

  return { regions: leafRegions, categories: categoryRows };
}

export async function getReviewItem(reviewItemId: string) {
  const db = getDatabase();
  const [row] = await db
    .select({
      id: reviewItems.id,
      type: reviewItems.type,
      risk: reviewItems.risk,
      status: reviewItems.status,
      cause: reviewItems.cause,
      submittedByActorId: reviewItems.submittedByActorId,
      previousValues: reviewItems.previousValues,
      proposedValues: reviewItems.proposedValues,
      createdAt: reviewItems.createdAt,
      updatedAt: reviewItems.updatedAt,
      resolvedAt: reviewItems.resolvedAt,
      officeId: offices.id,
      officeSlug: offices.slug,
      officeName: offices.name,
      officeSummary: offices.summary,
      officePhoneDisplay: offices.phoneDisplay,
      officeAddressText: offices.addressText,
      officeStatus: offices.status,
      officeUpdatedAt: offices.updatedAt,
      officeLastVerifiedAt: offices.lastVerifiedAt,
      collectedSourceUrl: collectedRecords.sourceUrl,
      collectedAt: collectedRecords.collectedAt,
      extractedValues: collectedRecords.extractedValues,
      normalizedValues: collectedRecords.normalizedValues,
    })
    .from(reviewItems)
    .leftJoin(offices, eq(reviewItems.officeId, offices.id))
    .leftJoin(
      collectedRecords,
      eq(reviewItems.collectedRecordId, collectedRecords.id),
    )
    .where(eq(reviewItems.id, reviewItemId))
    .limit(1);

  if (!row) {
    return null;
  }

  const [categoryRows, sourceRows, actionRows] = row.officeId
    ? await Promise.all([
        db
          .select({
            slug: serviceCategories.slug,
            name: serviceCategories.name,
          })
          .from(officeServiceCategories)
          .innerJoin(
            serviceCategories,
            eq(
              officeServiceCategories.serviceCategoryId,
              serviceCategories.id,
            ),
          )
          .where(eq(officeServiceCategories.officeId, row.officeId))
          .orderBy(
            asc(serviceCategories.displayOrder),
            asc(serviceCategories.name),
          ),
        db
          .select({
            id: officeSources.id,
            sourceType: officeSources.sourceType,
            url: officeSources.url,
            accessStatus: officeSources.accessStatus,
            isPrimary: officeSources.isPrimary,
            verifiedAt: officeSources.verifiedAt,
          })
          .from(officeSources)
          .where(eq(officeSources.officeId, row.officeId))
          .orderBy(desc(officeSources.isPrimary), desc(officeSources.verifiedAt)),
        db
          .select({
            id: reviewActions.id,
            actorId: reviewActions.actorId,
            decision: reviewActions.decision,
            editedValues: reviewActions.editedValues,
            reason: reviewActions.reason,
            createdAt: reviewActions.createdAt,
          })
          .from(reviewActions)
          .where(eq(reviewActions.reviewItemId, reviewItemId))
          .orderBy(desc(reviewActions.createdAt), desc(reviewActions.id)),
      ])
    : [
        [],
        [],
        await db
          .select({
            id: reviewActions.id,
            actorId: reviewActions.actorId,
            decision: reviewActions.decision,
            editedValues: reviewActions.editedValues,
            reason: reviewActions.reason,
            createdAt: reviewActions.createdAt,
          })
          .from(reviewActions)
          .where(eq(reviewActions.reviewItemId, reviewItemId))
          .orderBy(desc(reviewActions.createdAt), desc(reviewActions.id)),
      ];

  return {
    id: row.id,
    type: row.type,
    risk: row.risk,
    status: row.status,
    cause: row.cause,
    submittedByActorId: row.submittedByActorId,
    previousValues: row.previousValues,
    proposedValues: row.proposedValues,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
    office:
      row.officeId &&
      row.officeSlug &&
      row.officeName &&
      row.officeStatus &&
      row.officeUpdatedAt
        ? {
            id: row.officeId,
            slug: row.officeSlug,
            name: row.officeName,
            summary: row.officeSummary,
            phoneDisplay: row.officePhoneDisplay,
            addressText: row.officeAddressText,
            status: row.officeStatus,
            updatedAt: row.officeUpdatedAt,
            lastVerifiedAt: row.officeLastVerifiedAt,
            categories: categoryRows,
            sources: sourceRows.map((source) => ({
              ...source,
              isLinkable: isPublicHttpUrl(source.url),
            })),
          }
        : null,
    collection: row.collectedSourceUrl
      ? {
          sourceUrl: row.collectedSourceUrl,
          isLinkable: isPublicHttpUrl(row.collectedSourceUrl),
          collectedAt: row.collectedAt,
          extractedValues: row.extractedValues,
          normalizedValues: row.normalizedValues,
        }
      : null,
    actions: actionRows,
  };
}

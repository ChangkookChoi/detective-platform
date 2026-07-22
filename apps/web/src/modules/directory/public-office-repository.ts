import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";

import { getDatabase } from "@/db";
import {
  officeServiceCategories,
  officeSources,
  offices,
  regions,
  serviceCategories,
} from "@/db/schema";

export class PublicDirectoryFilterError extends Error {
  constructor(public readonly field: "category" | "limit" | "offset" | "region") {
    super(`Unsupported public directory filter: ${field}`);
    this.name = "PublicDirectoryFilterError";
  }
}

export type PublicOfficeListItem = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  phoneDisplay: string;
  addressText: string;
  lastVerifiedAt: Date;
  region: {
    slug: string;
    name: string;
  };
  categories: Array<{
    slug: string;
    name: string;
  }>;
};

export type PublicOfficeDetail = PublicOfficeListItem & {
  sources: Array<{
    url: string;
    sourceType: string;
    verifiedAt: Date;
    isPrimary: boolean;
  }>;
};

type PublicOfficeFilters = {
  region?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

function requirePublishedValue<T>(
  value: T | null,
  field: string,
  officeId: string,
): T {
  if (value === null) {
    throw new Error(`Published office ${officeId} is missing ${field}.`);
  }

  return value;
}

async function resolveRegionIds(regionSlug: string) {
  const db = getDatabase();
  const activeRegions = await db
    .select({ id: regions.id, parentId: regions.parentId, slug: regions.slug })
    .from(regions)
    .where(eq(regions.isActive, true));
  const selected = activeRegions.find((region) => region.slug === regionSlug);

  if (!selected) {
    throw new PublicDirectoryFilterError("region");
  }

  const descendantIds = new Set([selected.id]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const region of activeRegions) {
      if (
        region.parentId &&
        descendantIds.has(region.parentId) &&
        !descendantIds.has(region.id)
      ) {
        descendantIds.add(region.id);
        changed = true;
      }
    }
  }

  return [...descendantIds];
}

async function resolveCategoryId(categorySlug: string) {
  const db = getDatabase();
  const [category] = await db
    .select({ id: serviceCategories.id })
    .from(serviceCategories)
    .where(
      and(
        eq(serviceCategories.slug, categorySlug),
        eq(serviceCategories.isActive, true),
      ),
    )
    .limit(1);

  if (!category) {
    throw new PublicDirectoryFilterError("category");
  }

  return category.id;
}

async function loadCategories(officeIds: string[]) {
  if (officeIds.length === 0) {
    return new Map<string, PublicOfficeListItem["categories"]>();
  }

  const db = getDatabase();
  const rows = await db
    .select({
      officeId: officeServiceCategories.officeId,
      slug: serviceCategories.slug,
      name: serviceCategories.name,
      displayOrder: serviceCategories.displayOrder,
    })
    .from(officeServiceCategories)
    .innerJoin(
      serviceCategories,
      eq(
        officeServiceCategories.serviceCategoryId,
        serviceCategories.id,
      ),
    )
    .where(
      and(
        inArray(officeServiceCategories.officeId, officeIds),
        eq(serviceCategories.isActive, true),
      ),
    )
    .orderBy(
      asc(officeServiceCategories.officeId),
      asc(serviceCategories.displayOrder),
      asc(serviceCategories.slug),
    );
  const byOffice = new Map<string, PublicOfficeListItem["categories"]>();

  for (const row of rows) {
    const categories = byOffice.get(row.officeId) ?? [];
    categories.push({ slug: row.slug, name: row.name });
    byOffice.set(row.officeId, categories);
  }

  return byOffice;
}

export async function listPublicOffices(filters: PublicOfficeFilters = {}) {
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new PublicDirectoryFilterError("limit");
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new PublicDirectoryFilterError("offset");
  }

  const db = getDatabase();
  const conditions = [eq(offices.status, "published")];

  if (filters.region) {
    conditions.push(inArray(offices.regionId, await resolveRegionIds(filters.region)));
  }

  if (filters.category) {
    const categoryId = await resolveCategoryId(filters.category);
    conditions.push(
      sql`exists (
        select 1
        from ${officeServiceCategories}
        where ${officeServiceCategories.officeId} = ${offices.id}
          and ${officeServiceCategories.serviceCategoryId} = ${categoryId}
      )`,
    );
  }

  const rows = await db
    .select({
      id: offices.id,
      slug: offices.slug,
      name: offices.name,
      summary: offices.summary,
      phoneDisplay: offices.phoneDisplay,
      addressText: offices.addressText,
      lastVerifiedAt: offices.lastVerifiedAt,
      regionSlug: regions.slug,
      regionName: regions.name,
    })
    .from(offices)
    .innerJoin(regions, eq(offices.regionId, regions.id))
    .where(and(...conditions))
    .orderBy(asc(offices.name), asc(offices.id))
    .limit(limit)
    .offset(offset);
  const categories = await loadCategories(rows.map((row) => row.id));

  return rows.map(
    (row): PublicOfficeListItem => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      summary: row.summary,
      phoneDisplay: requirePublishedValue(row.phoneDisplay, "phoneDisplay", row.id),
      addressText: requirePublishedValue(row.addressText, "addressText", row.id),
      lastVerifiedAt: requirePublishedValue(
        row.lastVerifiedAt,
        "lastVerifiedAt",
        row.id,
      ),
      region: { slug: row.regionSlug, name: row.regionName },
      categories: categories.get(row.id) ?? [],
    }),
  );
}

export async function getPublicOfficeBySlug(
  slug: string,
): Promise<PublicOfficeDetail | null> {
  const db = getDatabase();
  const [row] = await db
    .select({
      id: offices.id,
      slug: offices.slug,
      name: offices.name,
      summary: offices.summary,
      phoneDisplay: offices.phoneDisplay,
      addressText: offices.addressText,
      lastVerifiedAt: offices.lastVerifiedAt,
      regionSlug: regions.slug,
      regionName: regions.name,
    })
    .from(offices)
    .innerJoin(regions, eq(offices.regionId, regions.id))
    .where(and(eq(offices.slug, slug), eq(offices.status, "published")))
    .limit(1);

  if (!row) {
    return null;
  }

  const [categories, sources] = await Promise.all([
    loadCategories([row.id]),
    db
      .select({
        url: officeSources.url,
        sourceType: officeSources.sourceType,
        verifiedAt: officeSources.verifiedAt,
        isPrimary: officeSources.isPrimary,
      })
      .from(officeSources)
      .where(
        and(
          eq(officeSources.officeId, row.id),
          eq(officeSources.accessStatus, "available"),
          isNotNull(officeSources.verifiedAt),
        ),
      )
      .orderBy(desc(officeSources.isPrimary), desc(officeSources.verifiedAt)),
  ]);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    phoneDisplay: requirePublishedValue(row.phoneDisplay, "phoneDisplay", row.id),
    addressText: requirePublishedValue(row.addressText, "addressText", row.id),
    lastVerifiedAt: requirePublishedValue(
      row.lastVerifiedAt,
      "lastVerifiedAt",
      row.id,
    ),
    region: { slug: row.regionSlug, name: row.regionName },
    categories: categories.get(row.id) ?? [],
    sources: sources.map((source) => ({
      ...source,
      verifiedAt: requirePublishedValue(
        source.verifiedAt,
        "source.verifiedAt",
        row.id,
      ),
    })),
  };
}

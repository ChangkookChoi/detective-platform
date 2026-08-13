import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { Pool, type PoolClient } from "pg";

import {
  insertDataset,
  parseDatabaseUrl,
  poolConfiguration,
  queryPublicDataset,
  readPublicDataset,
  resolveTargetReferences,
  type PublicDataset,
  validateConnectionBoundary,
  validateDataset,
} from "./bootstrap-public-data";

const confirmation = "PROMOTE_NEW_PUBLISHED_DATA_TO_EXISTING_TARGET";

export type PublicDataPromotionResult = {
  sourceOfficeCount: number;
  targetOfficeCountBefore: number;
  promotedOfficeCount: number;
  promotedCategoryCount: number;
  promotedSourceCount: number;
  promotedEvidenceCount: number;
  dryRun: boolean;
};

type PublicDataPromotionOptions = {
  dryRun?: boolean;
  expectedTargetOfficeCount?: number;
  expectedPromotedOfficeCount?: number;
};

function parseExpectedCount(name: string) {
  const value = process.env[name]?.trim();
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return Number(value);
}

function timestamp(value: Date | null) {
  return value?.toISOString() ?? null;
}

function publicOfficeGraph(dataset: PublicDataset, officeId: string) {
  const office = dataset.offices.find((item) => item.id === officeId);
  assert(office, `Public dataset is missing office ${officeId}.`);

  const sources = dataset.sources
    .filter((source) => source.office_id === officeId)
    .map((source) => ({
      id: source.id,
      sourceType: source.source_type,
      url: source.url,
      retrievedAt: timestamp(source.retrieved_at),
      verifiedAt: timestamp(source.verified_at),
      isPrimary: source.is_primary,
      accessStatus: source.access_status,
      createdAt: timestamp(source.created_at),
      updatedAt: timestamp(source.updated_at),
      evidence: dataset.evidence
        .filter((item) => item.office_source_id === source.id)
        .map((item) => ({
          id: item.id,
          fieldName: item.field_name,
          serviceCategorySlug: item.service_category_slug,
          verifiedAt: timestamp(item.verified_at),
          createdAt: timestamp(item.created_at),
          updatedAt: timestamp(item.updated_at),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    id: office.id,
    slug: office.slug,
    name: office.name,
    summary: office.summary,
    phoneNormalized: office.phone_normalized,
    phoneDisplay: office.phone_display,
    addressText: office.address_text,
    regionSlug: office.region_slug,
    status: office.status,
    publishedAt: timestamp(office.published_at),
    lastVerifiedAt: timestamp(office.last_verified_at),
    createdAt: timestamp(office.created_at),
    updatedAt: timestamp(office.updated_at),
    categories: dataset.categories
      .filter((category) => category.office_id === officeId)
      .map((category) => ({
        slug: category.service_category_slug,
        createdAt: timestamp(category.created_at),
      }))
      .sort((left, right) => left.slug.localeCompare(right.slug)),
    sources,
  };
}

function assertMatchingOfficeGraph(
  source: PublicDataset,
  target: PublicDataset,
  officeId: string,
) {
  assert.deepEqual(
    publicOfficeGraph(target, officeId),
    publicOfficeGraph(source, officeId),
    `Target public office ${officeId} differs from the reviewed source.`,
  );
}

function selectOffices(dataset: PublicDataset, officeIds: Set<string>) {
  const sourceIds = new Set(
    dataset.sources
      .filter((source) => officeIds.has(source.office_id))
      .map((source) => source.id),
  );

  return {
    offices: dataset.offices.filter((office) => officeIds.has(office.id)),
    categories: dataset.categories.filter((category) =>
      officeIds.has(category.office_id),
    ),
    sources: dataset.sources.filter((source) => officeIds.has(source.office_id)),
    evidence: dataset.evidence.filter((item) =>
      sourceIds.has(item.office_source_id),
    ),
  } satisfies PublicDataset;
}

function findNewOfficeIds(source: PublicDataset, target: PublicDataset) {
  const sourceOfficeIds = new Set(source.offices.map((office) => office.id));
  const targetOfficeIds = new Set(target.offices.map((office) => office.id));

  for (const targetOffice of target.offices) {
    if (!sourceOfficeIds.has(targetOffice.id)) {
      throw new Error(
        `Target published office ${targetOffice.id} is absent from the reviewed source.`,
      );
    }
    assertMatchingOfficeGraph(source, target, targetOffice.id);
  }

  return new Set(
    source.offices
      .filter((office) => !targetOfficeIds.has(office.id))
      .map((office) => office.id),
  );
}

async function assertNoTargetIdentifierCollisions(
  client: PoolClient,
  dataset: PublicDataset,
) {
  const officeIds = dataset.offices.map((office) => office.id);
  const officeSlugs = dataset.offices.map((office) => office.slug);
  const sourceIds = dataset.sources.map((source) => source.id);
  const evidenceIds = dataset.evidence.map((item) => item.id);

  const offices = await client.query<{ id: string }>(
    `select id from offices
     where id = any($1::uuid[]) or slug = any($2::text[])
     limit 1`,
    [officeIds, officeSlugs],
  );
  const sources = await client.query<{ id: string }>(
    "select id from office_sources where id = any($1::uuid[]) limit 1",
    [sourceIds],
  );
  const evidence = await client.query<{ id: string }>(
    "select id from office_source_evidence where id = any($1::uuid[]) limit 1",
    [evidenceIds],
  );

  if (offices.rowCount || sources.rowCount || evidence.rowCount) {
    throw new Error(
      "A new public record identifier or office slug already exists in the target.",
    );
  }
}

export async function promotePublicData(
  client: PoolClient,
  source: PublicDataset,
  options: PublicDataPromotionOptions = {},
): Promise<PublicDataPromotionResult> {
  validateDataset(source);
  await client.query("begin transaction isolation level serializable");

  try {
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended('detective-platform-public-data-transfer', 0))",
    );
    const targetBefore = await queryPublicDataset(client);
    if (targetBefore.offices.length === 0) {
      throw new Error(
        "Target has no published offices. Use the empty-target bootstrap command.",
      );
    }
    validateDataset(targetBefore);

    const newOfficeIds = findNewOfficeIds(source, targetBefore);
    const additions = selectOffices(source, newOfficeIds);

    if (options.expectedTargetOfficeCount !== undefined) {
      assert.equal(
        targetBefore.offices.length,
        options.expectedTargetOfficeCount,
        "Target published office count differs from the explicit expectation.",
      );
    }
    if (options.expectedPromotedOfficeCount !== undefined) {
      assert.equal(
        additions.offices.length,
        options.expectedPromotedOfficeCount,
        "New published office count differs from the explicit expectation.",
      );
    }

    if (additions.offices.length > 0) {
      validateDataset(additions);
      await assertNoTargetIdentifierCollisions(client, additions);
      const references = await resolveTargetReferences(client, additions);
      await insertDataset(client, additions, references);
    }

    const targetAfter = await queryPublicDataset(client);
    validateDataset(targetAfter);
    assert.equal(
      targetAfter.offices.length,
      source.offices.length,
      "Target published office count does not match the reviewed source.",
    );
    for (const office of source.offices) {
      assertMatchingOfficeGraph(source, targetAfter, office.id);
    }

    await client.query(options.dryRun ? "rollback" : "commit");
    return {
      sourceOfficeCount: source.offices.length,
      targetOfficeCountBefore: targetBefore.offices.length,
      promotedOfficeCount: additions.offices.length,
      promotedCategoryCount: additions.categories.length,
      promotedSourceCount: additions.sources.length,
      promotedEvidenceCount: additions.evidence.length,
      dryRun: options.dryRun ?? false,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function runPromotePublicData() {
  if (process.env.PROMOTE_PUBLIC_DATA_CONFIRM !== confirmation) {
    throw new Error(`PROMOTE_PUBLIC_DATA_CONFIRM must equal ${confirmation}.`);
  }

  const sourceUrl = parseDatabaseUrl(
    "SOURCE_DATABASE_URL",
    process.env.SOURCE_DATABASE_URL,
  );
  const targetUrl = parseDatabaseUrl(
    "TARGET_DATABASE_URL",
    process.env.TARGET_DATABASE_URL,
  );
  validateConnectionBoundary(sourceUrl, targetUrl, {
    allowLocalTarget: process.env.ALLOW_LOCAL_PROMOTION_TARGET === "1",
  });

  const sourcePool = new Pool(poolConfiguration(sourceUrl.toString()));
  const targetPool = new Pool(poolConfiguration(targetUrl.toString()));

  try {
    const sourceClient = await sourcePool.connect();
    let dataset: PublicDataset;
    try {
      dataset = await readPublicDataset(sourceClient);
    } finally {
      sourceClient.release();
    }

    validateDataset(dataset);
    const targetClient = await targetPool.connect();
    let result: PublicDataPromotionResult;
    try {
      result = await promotePublicData(targetClient, dataset, {
        dryRun: process.env.PROMOTE_PUBLIC_DATA_DRY_RUN === "1",
        expectedTargetOfficeCount: parseExpectedCount(
          "PROMOTE_PUBLIC_DATA_EXPECT_TARGET_OFFICES",
        ),
        expectedPromotedOfficeCount: parseExpectedCount(
          "PROMOTE_PUBLIC_DATA_EXPECT_NEW_OFFICES",
        ),
      });
    } finally {
      targetClient.release();
    }

    console.log(
      `Public data promotion ${result.dryRun ? "dry-run validated and rolled back" : "completed atomically"}: ` +
        `${result.promotedOfficeCount} offices, ` +
        `${result.promotedSourceCount} sources, ${result.promotedEvidenceCount} evidence rows, ` +
        `${result.promotedCategoryCount} category links added; ` +
        `${result.sourceOfficeCount} published offices now match.`,
    );
  } finally {
    await Promise.all([sourcePool.end(), targetPool.end()]);
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (entrypoint === import.meta.url) {
  runPromotePublicData().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Public data promotion failed.",
    );
    process.exitCode = 1;
  });
}

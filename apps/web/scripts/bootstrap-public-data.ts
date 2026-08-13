import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { Pool, type PoolClient, type PoolConfig } from "pg";

const confirmation = "IMPORT_PUBLISHED_DATA_TO_EMPTY_TARGET";
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

type OfficeRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  phone_normalized: string;
  phone_display: string;
  address_text: string;
  region_id: string;
  region_slug: string;
  status: "published";
  published_at: Date;
  last_verified_at: Date;
  created_at: Date;
  updated_at: Date;
};

type OfficeCategoryRow = {
  office_id: string;
  service_category_id: string;
  service_category_slug: string;
  created_at: Date;
};

type OfficeSourceRow = {
  id: string;
  office_id: string;
  source_type:
    | "official_website"
    | "public_data"
    | "official_social"
    | "manual_submission"
    | "other_public_source";
  url: string;
  retrieved_at: Date | null;
  verified_at: Date | null;
  is_primary: boolean;
  access_status: "available" | "blocked" | "missing_suspected" | "paused";
  created_at: Date;
  updated_at: Date;
};

type OfficeEvidenceRow = {
  id: string;
  office_source_id: string;
  field_name: "name" | "phone" | "address" | "service_category" | "summary";
  service_category_id: string | null;
  service_category_slug: string | null;
  verified_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type PublicDataset = {
  offices: OfficeRow[];
  categories: OfficeCategoryRow[];
  sources: OfficeSourceRow[];
  evidence: OfficeEvidenceRow[];
};

type TargetReferences = {
  regionIdsBySlug: Map<string, string>;
  categoryIdsBySlug: Map<string, string>;
};

export function poolConfiguration(connectionString: string): PoolConfig {
  return {
    connectionString,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    max: 1,
  };
}

export function parseDatabaseUrl(name: string, rawValue: string | undefined) {
  const value = rawValue?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${name} must be a PostgreSQL URL.`);
  }
  if (!url.hostname || !url.pathname.slice(1)) {
    throw new Error(`${name} must include a host and database name.`);
  }

  return url;
}

export function validateConnectionBoundary(
  sourceUrl: URL,
  targetUrl: URL,
  options: { allowLocalTarget?: boolean } = {},
) {
  if (!localHosts.has(sourceUrl.hostname)) {
    throw new Error("SOURCE_DATABASE_URL must target the local reviewed database.");
  }

  const allowLocalTarget =
    options.allowLocalTarget ??
    process.env.ALLOW_LOCAL_BOOTSTRAP_TARGET === "1";
  if (!allowLocalTarget) {
    if (localHosts.has(targetUrl.hostname)) {
      throw new Error("TARGET_DATABASE_URL must not target a local database.");
    }
    if (targetUrl.hostname.includes("-pooler.")) {
      throw new Error("TARGET_DATABASE_URL must use a direct, non-pooled endpoint.");
    }
    if (targetUrl.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("TARGET_DATABASE_URL must require sslmode=verify-full.");
    }
    if (targetUrl.searchParams.get("channel_binding") !== "require") {
      throw new Error("TARGET_DATABASE_URL must require channel_binding=require.");
    }
    if (["detective_runtime", "detective_backup"].includes(targetUrl.username)) {
      throw new Error("TARGET_DATABASE_URL must use the migration owner role.");
    }
  }

  if (
    sourceUrl.hostname === targetUrl.hostname &&
    sourceUrl.port === targetUrl.port &&
    sourceUrl.pathname === targetUrl.pathname
  ) {
    throw new Error("Source and target databases must be different.");
  }
}

export async function queryPublicDataset(
  client: PoolClient,
): Promise<PublicDataset> {
  const offices = await client.query<OfficeRow>(`
    select
      offices.id, offices.slug, offices.name, offices.summary,
      offices.phone_normalized, offices.phone_display, offices.address_text,
      offices.region_id, regions.slug as region_slug, offices.status,
      offices.published_at, offices.last_verified_at,
      offices.created_at, offices.updated_at
    from offices
    inner join regions on regions.id = offices.region_id
    where offices.status = 'published'
    order by offices.id
  `);

  const officeIds = offices.rows.map((office) => office.id);
  const categories = await client.query<OfficeCategoryRow>(
    `select
       links.office_id, links.service_category_id,
       categories.slug as service_category_slug, links.created_at
     from office_service_categories as links
     inner join service_categories as categories
       on categories.id = links.service_category_id
     where links.office_id = any($1::uuid[])
     order by links.office_id, links.service_category_id`,
    [officeIds],
  );
  const sources = await client.query<OfficeSourceRow>(
    `select
       id, office_id, source_type, url, retrieved_at, verified_at,
       is_primary, access_status, created_at, updated_at
     from office_sources
     where office_id = any($1::uuid[])
     order by office_id, id`,
    [officeIds],
  );

  const sourceIds = sources.rows.map((source) => source.id);
  const evidence = await client.query<OfficeEvidenceRow>(
    `select
       evidence.id, evidence.office_source_id, evidence.field_name,
       evidence.service_category_id,
       categories.slug as service_category_slug,
       evidence.verified_at, evidence.created_at, evidence.updated_at
     from office_source_evidence as evidence
     left join service_categories as categories
       on categories.id = evidence.service_category_id
     where evidence.office_source_id = any($1::uuid[])
     order by evidence.office_source_id, evidence.id`,
    [sourceIds],
  );

  return {
    offices: offices.rows,
    categories: categories.rows,
    sources: sources.rows,
    evidence: evidence.rows,
  };
}

export async function readPublicDataset(
  client: PoolClient,
): Promise<PublicDataset> {
  await client.query("begin transaction isolation level repeatable read read only");

  try {
    const dataset = await queryPublicDataset(client);
    assert(dataset.offices.length, "The source database has no published offices.");
    await client.query("commit");
    return dataset;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export function validateDataset(dataset: PublicDataset) {
  const officeIds = new Set(dataset.offices.map((office) => office.id));
  assert.equal(officeIds.size, dataset.offices.length, "Office IDs must be unique.");

  const sourcesByOffice = new Map<string, OfficeSourceRow[]>();
  for (const source of dataset.sources) {
    assert(officeIds.has(source.office_id), "A source references an unpublished office.");
    assert(["http:", "https:"].includes(new URL(source.url).protocol));
    const existing = sourcesByOffice.get(source.office_id) ?? [];
    existing.push(source);
    sourcesByOffice.set(source.office_id, existing);
  }

  const categorySlugsByOffice = new Map<string, Set<string>>();
  for (const category of dataset.categories) {
    assert(officeIds.has(category.office_id), "A category references an unpublished office.");
    const existing =
      categorySlugsByOffice.get(category.office_id) ?? new Set<string>();
    existing.add(category.service_category_slug);
    categorySlugsByOffice.set(category.office_id, existing);
  }

  const evidenceBySource = new Map<string, OfficeEvidenceRow[]>();
  const sourceIds = new Set(dataset.sources.map((source) => source.id));
  for (const item of dataset.evidence) {
    assert(sourceIds.has(item.office_source_id), "Evidence references an excluded source.");
    const existing = evidenceBySource.get(item.office_source_id) ?? [];
    existing.push(item);
    evidenceBySource.set(item.office_source_id, existing);
  }

  for (const office of dataset.offices) {
    const officeSources = sourcesByOffice.get(office.id) ?? [];
    assert.equal(
      officeSources.filter((source) => source.is_primary).length,
      1,
      `Published office ${office.id} must have exactly one primary source.`,
    );

    const officeEvidence = officeSources.flatMap(
      (source) => evidenceBySource.get(source.id) ?? [],
    );
    const evidenceFields = new Set(officeEvidence.map((item) => item.field_name));
    for (const field of ["name", "phone", "address"] as const) {
      assert(evidenceFields.has(field), `Published office ${office.id} lacks ${field} evidence.`);
    }

    const categorySlugs =
      categorySlugsByOffice.get(office.id) ?? new Set<string>();
    assert(categorySlugs.size > 0, `Published office ${office.id} has no service category.`);
    const evidencedCategorySlugs = new Set(
      officeEvidence
        .filter((item) => item.field_name === "service_category")
        .map((item) => item.service_category_slug),
    );
    for (const categorySlug of categorySlugs) {
      assert(
        evidencedCategorySlugs.has(categorySlug),
        `Published office ${office.id} lacks category evidence.`,
      );
    }
  }
}

async function assertEmptyTarget(client: PoolClient) {
  const result = await client.query<{ table_name: string; row_count: string }>(`
    select table_name, row_count
    from (
      select 'offices' as table_name, count(*)::text as row_count from offices
      union all select 'office_service_categories', count(*)::text from office_service_categories
      union all select 'office_sources', count(*)::text from office_sources
      union all select 'office_source_evidence', count(*)::text from office_source_evidence
      union all select 'collection_runs', count(*)::text from collection_runs
      union all select 'collected_records', count(*)::text from collected_records
      union all select 'review_items', count(*)::text from review_items
      union all select 'review_actions', count(*)::text from review_actions
      union all select 'analytics_events', count(*)::text from analytics_events
      union all select 'office_daily_metrics', count(*)::text from office_daily_metrics
      union all select 'placements', count(*)::text from placements
    ) as operational_counts
    where row_count::bigint <> 0
  `);

  if (result.rowCount) {
    throw new Error(
      `Target database is not empty: ${result.rows.map((row) => row.table_name).join(", ")}.`,
    );
  }
}

export async function resolveTargetReferences(
  client: PoolClient,
  dataset: PublicDataset,
): Promise<TargetReferences> {
  const regionSlugs = [...new Set(dataset.offices.map((office) => office.region_slug))];
  const categorySlugs = [
    ...new Set(dataset.categories.map((category) => category.service_category_slug)),
  ];
  const regions = await client.query<{ id: string; slug: string }>(
    "select id, slug from regions where slug = any($1::text[])",
    [regionSlugs],
  );
  const categories = await client.query<{ id: string; slug: string }>(
    "select id, slug from service_categories where slug = any($1::text[])",
    [categorySlugs],
  );

  assert.equal(
    regions.rowCount,
    regionSlugs.length,
    "Target region seed does not match source.",
  );
  assert.equal(
    categories.rowCount,
    categorySlugs.length,
    "Target service-category seed does not match source.",
  );

  return {
    regionIdsBySlug: new Map(regions.rows.map((row) => [row.slug, row.id])),
    categoryIdsBySlug: new Map(categories.rows.map((row) => [row.slug, row.id])),
  };
}

export async function insertDataset(
  client: PoolClient,
  dataset: PublicDataset,
  references: TargetReferences,
) {
  for (const office of dataset.offices) {
    await client.query(
      `insert into offices (
         id, slug, name, summary, phone_normalized, phone_display, address_text,
         region_id, status, published_at, last_verified_at, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        office.id,
        office.slug,
        office.name,
        office.summary,
        office.phone_normalized,
        office.phone_display,
        office.address_text,
        references.regionIdsBySlug.get(office.region_slug),
        office.status,
        office.published_at,
        office.last_verified_at,
        office.created_at,
        office.updated_at,
      ],
    );
  }

  for (const category of dataset.categories) {
    await client.query(
      `insert into office_service_categories (
         office_id, service_category_id, created_at
       ) values ($1, $2, $3)`,
      [
        category.office_id,
        references.categoryIdsBySlug.get(category.service_category_slug),
        category.created_at,
      ],
    );
  }

  for (const source of dataset.sources) {
    await client.query(
      `insert into office_sources (
         id, office_id, source_type, url, retrieved_at, verified_at,
         is_primary, access_status, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        source.id,
        source.office_id,
        source.source_type,
        source.url,
        source.retrieved_at,
        source.verified_at,
        source.is_primary,
        source.access_status,
        source.created_at,
        source.updated_at,
      ],
    );
  }

  for (const item of dataset.evidence) {
    await client.query(
      `insert into office_source_evidence (
         id, office_source_id, field_name, service_category_id,
         verified_at, created_at, updated_at
       ) values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        item.id,
        item.office_source_id,
        item.field_name,
        item.service_category_slug
          ? references.categoryIdsBySlug.get(item.service_category_slug)
          : null,
        item.verified_at,
        item.created_at,
        item.updated_at,
      ],
    );
  }
}

async function bootstrapTarget(client: PoolClient, dataset: PublicDataset) {
  await client.query("begin transaction isolation level serializable");

  try {
    await client.query(
      "select pg_advisory_xact_lock(hashtextextended('detective-platform-public-data-transfer', 0))",
    );
    await assertEmptyTarget(client);
    const references = await resolveTargetReferences(client, dataset);
    await insertDataset(client, dataset, references);

    const result = await client.query<{
      offices: string;
      categories: string;
      sources: string;
      evidence: string;
    }>(`
      select
        (select count(*)::text from offices where status = 'published') as offices,
        (select count(*)::text from office_service_categories) as categories,
        (select count(*)::text from office_sources) as sources,
        (select count(*)::text from office_source_evidence) as evidence
    `);
    const counts = result.rows[0];
    assert(counts);
    assert.equal(Number(counts.offices), dataset.offices.length);
    assert.equal(Number(counts.categories), dataset.categories.length);
    assert.equal(Number(counts.sources), dataset.sources.length);
    assert.equal(Number(counts.evidence), dataset.evidence.length);

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function runBootstrapPublicData() {
  if (process.env.BOOTSTRAP_PUBLIC_DATA_CONFIRM !== confirmation) {
    throw new Error(`BOOTSTRAP_PUBLIC_DATA_CONFIRM must equal ${confirmation}.`);
  }

  const sourceUrl = parseDatabaseUrl("SOURCE_DATABASE_URL", process.env.SOURCE_DATABASE_URL);
  const targetUrl = parseDatabaseUrl("TARGET_DATABASE_URL", process.env.TARGET_DATABASE_URL);
  validateConnectionBoundary(sourceUrl, targetUrl);

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
    console.log(
      `Validated public dataset: ${dataset.offices.length} offices, ` +
        `${dataset.sources.length} sources, ${dataset.evidence.length} evidence rows, ` +
        `${dataset.categories.length} category links.`,
    );

    const targetClient = await targetPool.connect();
    try {
      await bootstrapTarget(targetClient, dataset);
    } finally {
      targetClient.release();
    }

    console.log("Public data bootstrap completed atomically.");
  } finally {
    await Promise.all([sourcePool.end(), targetPool.end()]);
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (entrypoint === import.meta.url) {
  runBootstrapPublicData().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Public data bootstrap failed.",
    );
    process.exitCode = 1;
  });
}

import assert from "node:assert/strict";

import { config } from "dotenv";
import { Pool } from "pg";

import { regionSeed, serviceCategorySeed } from "../src/db/seed-data";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const requiredTables = [
  "analytics_events",
  "collected_records",
  "collection_runs",
  "office_service_categories",
  "office_source_evidence",
  "office_sources",
  "office_daily_metrics",
  "offices",
  "placements",
  "regions",
  "review_actions",
  "review_items",
  "service_categories",
] as const;

const requiredChecks = [
  "office_source_evidence_category_check",
  "office_daily_metrics_nonnegative_check",
  "offices_published_fields_check",
  "placements_valid_window_check",
  "regions_not_self_parent_check",
] as const;

function isPostgresErrorWithCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for database verification.");
  }

  const pool = new Pool({ connectionString });

  try {
    const versionResult = await pool.query<{ server_version_num: string }>(
      "show server_version_num",
    );
    const serverVersion = Number(versionResult.rows[0]?.server_version_num);

    assert(
      serverVersion >= 170000,
      `PostgreSQL 17 or newer is required, received ${serverVersion}`,
    );

    const tableResult = await pool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const tableNames = new Set(tableResult.rows.map((row) => row.table_name));

    for (const table of requiredTables) {
      assert(tableNames.has(table), `Missing table: ${table}`);
    }

    const migrationResult = await pool.query<{ count: string }>(
      "select count(*)::text as count from drizzle.__drizzle_migrations",
    );
    assert(
      Number(migrationResult.rows[0]?.count) >= 1,
      "Expected applied migration history",
    );

    const regionResult = await pool.query<{
      id: string;
      name: string;
      parent_id: string | null;
      slug: string;
      type: string;
    }>("select id, parent_id, type, name, slug from regions");
    assert.equal(regionResult.rowCount, regionSeed.length);

    const regionsBySlug = new Map(
      regionResult.rows.map((region) => [region.slug, region]),
    );

    for (const expected of regionSeed) {
      const actual = regionsBySlug.get(expected.slug);
      assert(actual, `Missing region seed: ${expected.slug}`);
      assert.equal(actual.id, expected.id);
      assert.equal(actual.parent_id, expected.parentId);
      assert.equal(actual.type, expected.type);
      assert.equal(actual.name, expected.name);
    }

    const categoryResult = await pool.query<{ slug: string }>(
      "select slug from service_categories",
    );
    assert.equal(categoryResult.rowCount, serviceCategorySeed.length);
    assert.deepEqual(
      new Set(categoryResult.rows.map((row) => row.slug)),
      new Set(serviceCategorySeed.map((category) => category.slug)),
    );

    const checkResult = await pool.query<{ constraint_name: string }>(
      `select constraint_name
       from information_schema.table_constraints
       where constraint_schema = 'public' and constraint_type = 'CHECK'`,
    );
    const checkNames = new Set(
      checkResult.rows.map((row) => row.constraint_name),
    );

    for (const check of requiredChecks) {
      assert(checkNames.has(check), `Missing check constraint: ${check}`);
    }

    const phoneIndexResult = await pool.query<{ indexdef: string }>(
      `select indexdef
       from pg_indexes
       where schemaname = 'public'
         and tablename = 'offices'
         and indexdef ilike '%phone_normalized%'`,
    );
    assert.equal(phoneIndexResult.rowCount, 1);
    assert(
      !phoneIndexResult.rows[0]?.indexdef.includes("UNIQUE INDEX"),
      "phone_normalized must not be globally unique",
    );

    const client = await pool.connect();

    try {
      await client.query("begin");
      await assert.rejects(
        client.query("update regions set parent_id = id where slug = 'seoul'"),
        (error: unknown) => isPostgresErrorWithCode(error, "23514"),
      );
    } finally {
      await client.query("rollback");
      client.release();
    }

    console.log("Database integration verification completed.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Database verification failed.",
  );
  process.exitCode = 1;
});

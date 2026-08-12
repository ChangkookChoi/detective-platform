import assert from "node:assert/strict";

import { config } from "dotenv";
import { Pool } from "pg";

const injectedDatabaseUrl = process.env.DATABASE_URL?.trim();

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function requireMinimumPublishedOffices() {
  const value = process.env.MINIMUM_PUBLISHED_OFFICES?.trim();
  const parsed = Number(value);

  if (!value || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error("MINIMUM_PUBLISHED_OFFICES must be a positive integer.");
  }

  return parsed;
}

async function main() {
  const connectionString = injectedDatabaseUrl || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for restored backup verification.");
  }

  const minimumPublishedOffices = requireMinimumPublishedOffices();
  const pool = new Pool({ connectionString, max: 1 });

  try {
    const result = await pool.query<{
      office_count: string;
      published_office_count: string;
      published_without_category_count: string;
      published_without_evidence_count: string;
      published_without_primary_source_count: string;
    }>(`
      select
        count(*)::text as office_count,
        count(*) filter (where office.status = 'published')::text
          as published_office_count,
        count(*) filter (
          where office.status = 'published'
            and not exists (
              select 1
              from office_service_categories category
              where category.office_id = office.id
            )
        )::text as published_without_category_count,
        count(*) filter (
          where office.status = 'published'
            and not exists (
              select 1
              from office_sources source
              join office_source_evidence evidence
                on evidence.office_source_id = source.id
              where source.office_id = office.id
            )
        )::text as published_without_evidence_count,
        count(*) filter (
          where office.status = 'published'
            and not exists (
              select 1
              from office_sources source
              where source.office_id = office.id
                and source.is_primary = true
            )
        )::text as published_without_primary_source_count
      from offices office
    `);
    const snapshot = result.rows[0];

    assert(snapshot, "Could not inspect the restored production snapshot.");

    const officeCount = Number(snapshot.office_count);
    const publishedOfficeCount = Number(snapshot.published_office_count);

    assert(
      publishedOfficeCount >= minimumPublishedOffices,
      `Expected at least ${minimumPublishedOffices} published offices, received ${publishedOfficeCount}.`,
    );
    assert(
      officeCount >= publishedOfficeCount,
      "Published office count cannot exceed the total office count.",
    );
    assert.equal(
      Number(snapshot.published_without_category_count),
      0,
      "Every published office requires at least one service category.",
    );
    assert.equal(
      Number(snapshot.published_without_evidence_count),
      0,
      "Every published office requires source evidence.",
    );
    assert.equal(
      Number(snapshot.published_without_primary_source_count),
      0,
      "Every published office requires a primary source.",
    );

    console.log(
      `Restored production snapshot verification completed: ${publishedOfficeCount} published offices.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? `Restored production backup verification failed: ${error.message}`
      : "Restored production backup verification failed.",
  );
  process.exitCode = 1;
});

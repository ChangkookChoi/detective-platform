import assert from "node:assert/strict";

import { Pool, type PoolClient } from "pg";

import { readPublicDataset } from "./bootstrap-public-data";
import { promotePublicData } from "./promote-public-data";

const existingOffice = {
  id: "81000000-0000-4000-8000-000000000001",
  slug: "promotion-existing-office",
  name: "증분 승격 기존 공개 사무소",
  sourceId: "82000000-0000-4000-8000-000000000001",
  evidenceIds: [
    "83000000-0000-4000-8000-000000000001",
    "83000000-0000-4000-8000-000000000002",
    "83000000-0000-4000-8000-000000000003",
    "83000000-0000-4000-8000-000000000004",
  ],
  categories: ["family"],
} as const;

const newOffice = {
  id: "81000000-0000-4000-8000-000000000002",
  slug: "promotion-new-office",
  name: "증분 승격 신규 공개 사무소",
  sourceId: "82000000-0000-4000-8000-000000000002",
  evidenceIds: [
    "83000000-0000-4000-8000-000000000005",
    "83000000-0000-4000-8000-000000000006",
    "83000000-0000-4000-8000-000000000007",
    "83000000-0000-4000-8000-000000000008",
    "83000000-0000-4000-8000-000000000009",
  ],
  categories: ["family", "evidence-fact-checking"],
} as const;

const targetOnlyOffice = {
  id: "81000000-0000-4000-8000-000000000003",
  slug: "promotion-target-only-office",
  name: "증분 승격 대상 전용 공개 사무소",
  sourceId: "82000000-0000-4000-8000-000000000003",
  evidenceIds: [
    "83000000-0000-4000-8000-000000000010",
    "83000000-0000-4000-8000-000000000011",
    "83000000-0000-4000-8000-000000000012",
    "83000000-0000-4000-8000-000000000013",
  ],
  categories: ["family"],
} as const;

const collisionOffice = {
  id: "81000000-0000-4000-8000-000000000004",
  slug: "promotion-collision-office",
  name: "증분 승격 충돌 공개 사무소",
  sourceId: "82000000-0000-4000-8000-000000000004",
  evidenceIds: [
    "83000000-0000-4000-8000-000000000014",
    "83000000-0000-4000-8000-000000000015",
    "83000000-0000-4000-8000-000000000016",
    "83000000-0000-4000-8000-000000000017",
  ],
  categories: ["family"],
} as const;

const draftOfficeId = "81000000-0000-4000-8000-000000000005";
const collisionDraftOfficeId = "81000000-0000-4000-8000-000000000006";
const privateRunId = "84000000-0000-4000-8000-000000000001";
const privateRecordId = "85000000-0000-4000-8000-000000000001";
const privateReviewId = "86000000-0000-4000-8000-000000000001";
const verifiedAt = new Date("2026-08-13T00:00:00.000Z");

type OfficeFixture = {
  id: string;
  slug: string;
  name: string;
  sourceId: string;
  evidenceIds: readonly string[];
  categories: readonly string[];
};

function requireUrl(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function seedPublishedOffice(client: PoolClient, office: OfficeFixture) {
  const region = await client.query<{ id: string }>(
    "select id from regions where slug = 'seoul-seocho'",
  );
  const categories = await client.query<{ id: string; slug: string }>(
    "select id, slug from service_categories where slug = any($1::text[])",
    [office.categories],
  );
  assert.equal(region.rowCount, 1);
  assert.equal(categories.rowCount, office.categories.length);

  await client.query(
    `insert into offices (
       id, slug, name, phone_normalized, phone_display, address_text,
       region_id, status, published_at, last_verified_at, created_at, updated_at
     ) values ($1, $2, $3, '0212345678', '02-1234-5678',
       '서울특별시 서초구 검증로 1', $4, 'published', $5, $5, $5, $5)`,
    [office.id, office.slug, office.name, region.rows[0]?.id, verifiedAt],
  );

  for (const category of categories.rows) {
    await client.query(
      `insert into office_service_categories (
         office_id, service_category_id, created_at
       ) values ($1, $2, $3)`,
      [office.id, category.id, verifiedAt],
    );
  }

  await client.query(
    `insert into office_sources (
       id, office_id, source_type, url, retrieved_at, verified_at,
       is_primary, access_status, created_at, updated_at
     ) values ($1, $2, 'official_website', $3, $4, $4, true,
       'available', $4, $4)`,
    [
      office.sourceId,
      office.id,
      `https://promotion.example.invalid/${office.slug}`,
      verifiedAt,
    ],
  );

  const baseEvidence = ["name", "phone", "address"] as const;
  for (const [index, fieldName] of baseEvidence.entries()) {
    await client.query(
      `insert into office_source_evidence (
         id, office_source_id, field_name, verified_at, created_at, updated_at
       ) values ($1, $2, $3, $4, $4, $4)`,
      [office.evidenceIds[index], office.sourceId, fieldName, verifiedAt],
    );
  }

  for (const [index, category] of categories.rows
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .entries()) {
    await client.query(
      `insert into office_source_evidence (
         id, office_source_id, field_name, service_category_id,
         verified_at, created_at, updated_at
       ) values ($1, $2, 'service_category', $3, $4, $4, $4)`,
      [office.evidenceIds[index + 3], office.sourceId, category.id, verifiedAt],
    );
  }
}

async function seedPrivateTargetState(client: PoolClient) {
  await client.query(
    `insert into collection_runs (
       id, source_name, adapter_name, extractor_version, status,
       finished_at, discovered_count, collected_count
     ) values ($1, 'promotion-private-marker', 'synthetic', 'promotion-v1',
       'succeeded', $2, 1, 1)`,
    [privateRunId, verifiedAt],
  );
  await client.query(
    `insert into collected_records (
       id, collection_run_id, source_url, source_record_key,
       extracted_values, normalized_values, content_hash
     ) values ($1, $2, 'https://private.example.invalid/record', 'private',
       '{"name":"private"}', '{"name":"private"}', 'private')`,
    [privateRecordId, privateRunId],
  );
  await client.query(
    `insert into review_items (
       id, collected_record_id, type, risk, status, proposed_values, cause
     ) values ($1, $2, 'new_office', 'high', 'on_hold',
       '{"name":"private"}', 'promotion_private_marker')`,
    [privateReviewId, privateRecordId],
  );
}

async function readSource(client: PoolClient) {
  return readPublicDataset(client);
}

async function main() {
  const sourcePool = new Pool({
    connectionString: requireUrl("SOURCE_DATABASE_URL"),
    max: 1,
  });
  const targetPool = new Pool({
    connectionString: requireUrl("TARGET_DATABASE_URL"),
    max: 1,
  });
  const [source, target] = await Promise.all([
    sourcePool.connect(),
    targetPool.connect(),
  ]);

  try {
    await seedPublishedOffice(source, existingOffice);
    await seedPublishedOffice(source, newOffice);
    await source.query(
      `insert into offices (id, slug, name, region_id, status)
       select $1, 'promotion-unpublished-office', '승격 제외 비공개 사무소', id, 'draft'
       from regions where slug = 'seoul-seocho'`,
      [draftOfficeId],
    );
    await seedPublishedOffice(target, existingOffice);
    await seedPrivateTargetState(target);

    const initialSource = await readSource(source);
    await assert.rejects(
      promotePublicData(target, initialSource, {
        expectedTargetOfficeCount: 30,
        expectedPromotedOfficeCount: 1,
      }),
      /explicit expectation/,
    );
    const countAfterExpectationMismatch = await target.query<{ count: number }>(
      "select count(*)::integer as count from offices where status = 'published'",
    );
    assert.equal(countAfterExpectationMismatch.rows[0]?.count, 1);

    const dryRun = await promotePublicData(target, initialSource, {
      dryRun: true,
      expectedTargetOfficeCount: 1,
      expectedPromotedOfficeCount: 1,
    });
    assert.equal(dryRun.dryRun, true);
    const countAfterDryRun = await target.query<{ count: number }>(
      "select count(*)::integer as count from offices where status = 'published'",
    );
    assert.equal(countAfterDryRun.rows[0]?.count, 1);

    const promoted = await promotePublicData(target, initialSource, {
      expectedTargetOfficeCount: 1,
      expectedPromotedOfficeCount: 1,
    });
    assert.deepEqual(promoted, {
      sourceOfficeCount: 2,
      targetOfficeCountBefore: 1,
      promotedOfficeCount: 1,
      promotedCategoryCount: 2,
      promotedSourceCount: 1,
      promotedEvidenceCount: 5,
      dryRun: false,
    });

    const counts = await target.query<{
      published: number;
      draft: number;
      reviews: number;
      runs: number;
    }>(`
      select
        (select count(*)::integer from offices where status = 'published') as published,
        (select count(*)::integer from offices where slug = 'promotion-unpublished-office') as draft,
        (select count(*)::integer from review_items where id = '${privateReviewId}') as reviews,
        (select count(*)::integer from collection_runs where id = '${privateRunId}') as runs
    `);
    assert.deepEqual(counts.rows[0], {
      published: 2,
      draft: 0,
      reviews: 1,
      runs: 1,
    });

    const repeated = await promotePublicData(target, initialSource);
    assert.equal(repeated.promotedOfficeCount, 0);
    assert.equal(repeated.targetOfficeCountBefore, 2);

    await target.query("update offices set name = '대상 불일치' where id = $1", [
      existingOffice.id,
    ]);
    await assert.rejects(
      promotePublicData(target, initialSource),
      /differs from the reviewed source/,
    );
    const newOfficeAfterMismatch = await target.query<{ count: number }>(
      "select count(*)::integer as count from offices where id = $1",
      [newOffice.id],
    );
    assert.equal(newOfficeAfterMismatch.rows[0]?.count, 1);
    await target.query("update offices set name = $1 where id = $2", [
      existingOffice.name,
      existingOffice.id,
    ]);

    await seedPublishedOffice(target, targetOnlyOffice);
    await assert.rejects(
      promotePublicData(target, initialSource),
      /absent from the reviewed source/,
    );
    await target.query("delete from offices where id = $1", [targetOnlyOffice.id]);

    await seedPublishedOffice(source, collisionOffice);
    await target.query(
      `insert into offices (id, slug, name, region_id, status)
       select $1, $2, '대상 slug 충돌 사무소', id, 'draft'
       from regions where slug = 'seoul-seocho'`,
      [collisionDraftOfficeId, collisionOffice.slug],
    );
    const collisionSource = await readSource(source);
    await assert.rejects(
      promotePublicData(target, collisionSource),
      /identifier or office slug already exists/,
    );
    const collisionPublished = await target.query<{ count: number }>(
      "select count(*)::integer as count from offices where id = $1",
      [collisionOffice.id],
    );
    assert.equal(collisionPublished.rows[0]?.count, 0);
    await target.query("delete from offices where id = $1", [
      collisionDraftOfficeId,
    ]);

    console.log(
      "Incremental public data promotion verification completed: atomic add, no-op replay, mismatch, target-only, slug collision, and private-data isolation passed.",
    );
  } finally {
    source.release();
    target.release();
    await Promise.all([sourcePool.end(), targetPool.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Incremental public data promotion verification failed.",
  );
  process.exitCode = 1;
});

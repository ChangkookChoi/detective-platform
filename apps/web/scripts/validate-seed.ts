import assert from "node:assert/strict";

import { regionSeed, serviceCategorySeed } from "../src/db/seed-data";

const regionIds = new Set<string>();
const regionSlugs = new Set<string>();
const regionById = new Map<string, (typeof regionSeed)[number]>();

for (const region of regionSeed) {
  assert(!regionIds.has(region.id), `Duplicate region id: ${region.id}`);
  assert(!regionSlugs.has(region.slug), `Duplicate region slug: ${region.slug}`);

  if (region.parentId) {
    assert(
      regionIds.has(region.parentId),
      `Parent region must precede child: ${region.slug}`,
    );
    assert.notEqual(region.id, region.parentId, `Region cannot parent itself: ${region.slug}`);
  }

  regionIds.add(region.id);
  regionSlugs.add(region.slug);
  regionById.set(region.id, region);
}

const seoul = regionSeed.find((region) => region.slug === "seoul");
const gyeonggi = regionSeed.find((region) => region.slug === "gyeonggi");

assert(seoul, "Seoul root region is required");
assert(gyeonggi, "Gyeonggi root region is required");
assert.equal(regionSeed.length, 82, "Expected 82 Seoul and Gyeonggi regions");
assert.equal(
  regionSeed.filter((region) => region.parentId === seoul.id).length,
  25,
  "Seoul requires 25 districts",
);
assert.equal(
  regionSeed.filter((region) => region.parentId === gyeonggi.id).length,
  31,
  "Gyeonggi requires 31 municipalities",
);
assert.equal(
  regionSeed.filter((region) => {
    const parent = region.parentId ? regionById.get(region.parentId) : undefined;
    return parent?.parentId === gyeonggi.id;
  }).length,
  24,
  "Gyeonggi requires 24 general districts",
);

for (const region of regionSeed) {
  if (region.parentId === null) {
    assert.equal(region.type, "province");
  }

  if (region.type === "district") {
    assert(region.parentId, `District requires a parent: ${region.slug}`);
  }
}

const categorySlugs = serviceCategorySeed.map((category) => category.slug);

assert.equal(
  serviceCategorySeed.length,
  5,
  "MVP requires five service categories",
);
assert.equal(
  new Set(categorySlugs).size,
  categorySlugs.length,
  "Service category slugs must be unique",
);

console.log("Seed validation completed.");

import assert from "node:assert/strict";

import { regionSeed, serviceCategorySeed } from "../src/db/seed-data";

const regionIds = new Set<string>();
const regionSlugs = new Set<string>();

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
}

const categorySlugs = serviceCategorySeed.map((category) => category.slug);

assert.equal(serviceCategorySeed.length, 5, "MVP requires five service categories");
assert.equal(
  new Set(categorySlugs).size,
  categorySlugs.length,
  "Service category slugs must be unique",
);

console.log("Seed validation completed.");

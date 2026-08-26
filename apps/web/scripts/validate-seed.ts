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
const incheon = regionSeed.find((region) => region.slug === "incheon");

assert(seoul, "Seoul root region is required");
assert(gyeonggi, "Gyeonggi root region is required");
assert(incheon, "Incheon root region is required");
assert.equal(
  regionSeed.length,
  94,
  "Expected 94 Seoul, Gyeonggi, and Incheon regions",
);
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
const incheonChildren = regionSeed.filter(
  (region) => region.parentId === incheon.id,
);
assert.equal(incheonChildren.length, 11, "Incheon requires 2 counties and 9 districts");
assert.deepEqual(
  new Set(incheonChildren.map((region) => region.slug)),
  new Set([
    "incheon-ganghwa",
    "incheon-ongjin",
    "incheon-jemulpo",
    "incheon-yeongjong",
    "incheon-michuhol",
    "incheon-yeonsu",
    "incheon-namdong",
    "incheon-bupyeong",
    "incheon-gyeyang",
    "incheon-seohae",
    "incheon-geomdan",
  ]),
  "Incheon seed must follow the administrative structure effective 2026-07-01",
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

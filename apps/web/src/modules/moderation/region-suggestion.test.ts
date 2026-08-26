import assert from "node:assert/strict";
import test from "node:test";

import { suggestRegionSlugFromAddress } from "./region-suggestion";

const regionGroups = [
  {
    slug: "seoul",
    name: "서울특별시",
    regions: [{ slug: "seoul-gangnam", label: "강남구" }],
  },
  {
    slug: "gyeonggi",
    name: "경기도",
    regions: [
      { slug: "gyeonggi-suwon-paldal", label: "수원시 / 팔달구" },
      { slug: "gyeonggi-gunpo", label: "군포시" },
    ],
  },
  {
    slug: "incheon",
    name: "인천광역시",
    regions: [
      { slug: "incheon-yeonsu", label: "연수구" },
      { slug: "incheon-namdong", label: "남동구" },
    ],
  },
];

test("공식 주소에서 서울과 경기의 최하위 지역을 제안한다", () => {
  assert.equal(
    suggestRegionSlugFromAddress(
      "서울특별시 강남구 테헤란로 1",
      regionGroups,
    ),
    "seoul-gangnam",
  );
  assert.equal(
    suggestRegionSlugFromAddress(
      "경기도 수원시 팔달구 효원로 1",
      regionGroups,
    ),
    "gyeonggi-suwon-paldal",
  );
});

test("SG탐정법인의 공식 주소에서 인천 연수구를 제안한다", () => {
  assert.equal(
    suggestRegionSlugFromAddress(
      "인천광역시 연수구 새말로96번길 30 202호(이강빌딩)",
      regionGroups,
    ),
    "incheon-yeonsu",
  );
});

test("지원 범위 밖이거나 지역명이 부족한 주소는 추측하지 않는다", () => {
  assert.equal(
    suggestRegionSlugFromAddress("부산광역시 해운대구 센텀로 1", regionGroups),
    "",
  );
  assert.equal(
    suggestRegionSlugFromAddress("인천광역시 소재", regionGroups),
    "",
  );
});

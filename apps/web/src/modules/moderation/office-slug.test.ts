import assert from "node:assert/strict";
import test from "node:test";

import {
  createOfficeSlugBase,
  suggestAvailableOfficeSlug,
} from "./office-slug";

test("SG 영문·한글 표기에서 같은 읽기 쉬운 slug를 만든다", () => {
  assert.equal(
    createOfficeSlugBase("SG탐정법인", "incheon-yeonsu"),
    "sg-detective-incheon-yeonsu",
  );
  assert.equal(
    createOfficeSlugBase("에스지 인천 탐정법인", "incheon-yeonsu", [
      "인천광역시",
      "인천",
      "연수구",
      "연수",
      "incheon",
      "yeonsu",
    ]),
    "sg-detective-incheon-yeonsu",
  );
});

test("한글 브랜드를 코드로 로마자화하고 일반 업종 표현은 중복하지 않는다", () => {
  assert.equal(
    createOfficeSlugBase("해담 탐정사무소", "seoul-seocho"),
    "haedam-detective-seoul-seocho",
  );
  assert.equal(
    createOfficeSlugBase("Incheon SG Detective", "incheon-yeonsu", [
      "incheon",
    ]),
    "sg-detective-incheon-yeonsu",
  );
});

test("기본 slug가 사용 중이면 검수 항목 기반의 안정적인 suffix를 붙인다", () => {
  const first = suggestAvailableOfficeSlug({
    name: "SG탐정법인",
    regionSlug: "incheon-yeonsu",
    unavailableSlugs: ["sg-detective-incheon-yeonsu"],
    stableKey: "db98fb88-b880-457e-a5c8-268b46e441a6",
    regionNames: ["인천"],
  });
  const repeated = suggestAvailableOfficeSlug({
    name: "SG탐정법인",
    regionSlug: "incheon-yeonsu",
    unavailableSlugs: ["sg-detective-incheon-yeonsu"],
    stableKey: "db98fb88-b880-457e-a5c8-268b46e441a6",
    regionNames: ["인천"],
  });

  assert.match(first, /^sg-detective-incheon-yeonsu-[a-f0-9]{6}$/u);
  assert.equal(repeated, first);
  const extended = suggestAvailableOfficeSlug({
    name: "SG탐정법인",
    regionSlug: "incheon-yeonsu",
    unavailableSlugs: ["sg-detective-incheon-yeonsu", first],
    stableKey: "db98fb88-b880-457e-a5c8-268b46e441a6",
    regionNames: ["인천"],
  });
  assert.match(extended, /^sg-detective-incheon-yeonsu-[a-f0-9]{8}$/u);
});

test("긴 업체명과 충돌 suffix도 80자 및 형식 제한을 지킨다", () => {
  const base = createOfficeSlugBase(
    "가나다라마바사아자차카타파하".repeat(5) + " 탐정사무소",
    "gyeonggi-suwon-paldal",
  );
  const collision = suggestAvailableOfficeSlug({
    name: "가나다라마바사아자차카타파하".repeat(5) + " 탐정사무소",
    regionSlug: "gyeonggi-suwon-paldal",
    unavailableSlugs: [base],
    stableKey: "stable-review-key",
  });

  assert(base.length <= 80);
  assert(collision.length <= 80);
  assert.match(collision, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
});

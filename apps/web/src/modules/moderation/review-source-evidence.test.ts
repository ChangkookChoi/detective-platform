import assert from "node:assert/strict";
import test from "node:test";

import { presentReviewSourceEvidence } from "./review-source-evidence";

test("표시 형식이 달라도 전화·이메일·주소의 정규화 값은 일치로 표시한다", () => {
  const rows = presentReviewSourceEvidence({
    candidateValues: {
      name: "샘플 탐정사무소",
      phoneDisplay: "02-1234-5678",
      emailDisplay: "CONTACT@EXAMPLE.COM",
      addressText: "서울특별시 강남구 테헤란로 10",
    },
    extractedValues: {
      name: "샘플 탐정사무소",
      phone: "02 1234 5678",
      email: "contact@example.com",
      address: "서울특별시 강남구, 테헤란로 10",
    },
    normalizedValues: {},
  });

  assert.deepEqual(
    rows.map(({ field, status }) => ({ field, status })),
    [
      { field: "name", status: "match" },
      { field: "phone", status: "match" },
      { field: "email", status: "match" },
      { field: "address", status: "match" },
    ],
  );
});

test("후보와 출처의 차이·누락을 자동 승인과 구분한다", () => {
  const rows = presentReviewSourceEvidence({
    candidateValues: {
      name: "후보 탐정사무소",
      phoneDisplay: "02-1111-2222",
    },
    extractedValues: {
      name: "다른 탐정사무소",
      address: "서울특별시 중구 세종대로 1",
    },
    normalizedValues: {},
  });

  assert.deepEqual(
    rows.map(({ field, status }) => ({ field, status })),
    [
      { field: "name", status: "different" },
      { field: "phone", status: "missing_source" },
      { field: "email", status: "unavailable" },
      { field: "address", status: "missing_candidate" },
    ],
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDiscoveryReviewCandidates,
  stageDiscoveryReviewCandidates,
} from "./discovery-review-intake";

const now = new Date("2026-08-26T03:00:00.000Z");

function record(overrides: Record<string, unknown> = {}) {
  return {
    version: 3,
    rules_version: "office-discovery-review-v3",
    candidate_id: "a".repeat(64),
    candidate_name: "검증 탐정사무소",
    candidate_address: "서울특별시 강남구 검증로 1",
    phone_normalized: "0212345678",
    phone_display: "02-1234-5678",
    email_normalized: null,
    email_display: null,
    email_kind: null,
    source_url: "https://official.example/office",
    evidence_status: "strong_fact_match",
    business_relevance: "probable",
    relevance_reason_codes: ["STRONG_OFFICE_NAME"],
    business_service_match: true,
    name_match: true,
    address_match: true,
    region_match: true,
    evidence_run_id: "official-run-1",
    checked_at: "2026-08-26T02:00:00.000Z",
    expires_at: "2026-09-01T02:00:00.000Z",
    review_status: "pending",
    promotion_allowed: false,
    ...overrides,
  };
}

test("공식 최소 사실이 모두 확인된 최신 후보만 intake 대상으로 읽는다", () => {
  const parsed = parseDiscoveryReviewCandidates(
    `${JSON.stringify(record())}\n`,
    now,
  );

  assert.equal(parsed.recordCount, 1);
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.ineligibleCount, 0);
  assert.equal(parsed.candidates[0]?.sourceUrl, "https://official.example/office");
});

test("인천 공식 주소는 공개 intake 대상으로 읽고 범위 밖 주소는 제외한다", () => {
  const content = [
    record({
      candidate_id: "f".repeat(64),
      candidate_name: "SG탐정법인",
      candidate_address:
        "21925 인천광역시 연수구 새말로96번길 30 202호(이강빌딩)",
    }),
    record({
      candidate_id: "9".repeat(64),
      candidate_address: "부산광역시 해운대구 센텀로 1",
    }),
  ]
    .map((value) => JSON.stringify(value))
    .join("\n");
  const parsed = parseDiscoveryReviewCandidates(content, now);

  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.candidates[0]?.name, "SG탐정법인");
  assert.equal(
    parsed.candidates[0]?.addressText,
    "21925 인천광역시 연수구 새말로96번길 30 202호(이강빌딩)",
  );
  assert.equal(parsed.ineligibleCount, 1);
  assert.deepEqual(parsed.reasonCounts, { PUBLIC_REGION_SCOPE_REQUIRED: 1 });
});

test("주소 일치가 없거나 24시간보다 오래된 공식 사실은 적재 대상에서 제외한다", () => {
  const content = [
    record({ candidate_id: "b".repeat(64), address_match: false }),
    record({
      candidate_id: "c".repeat(64),
      checked_at: "2026-08-24T02:00:00.000Z",
    }),
  ]
    .map((value) => JSON.stringify(value))
    .join("\n");
  const parsed = parseDiscoveryReviewCandidates(content, now);

  assert.equal(parsed.candidates.length, 0);
  assert.equal(parsed.ineligibleCount, 2);
  assert.deepEqual(parsed.reasonCounts, {
    OFFICIAL_FACT_CONFIRMATION_REQUIRED: 1,
    OFFICIAL_FACTS_STALE: 1,
  });
});

test("HTTP 출처와 표시값이 다른 전화 정규화는 입력 오류로 중단한다", () => {
  assert.throws(
    () =>
      parseDiscoveryReviewCandidates(
        JSON.stringify(record({ source_url: "http://official.example/" })),
        now,
      ),
    /discovery_intake_source_url_invalid/,
  );
  assert.throws(
    () =>
      parseDiscoveryReviewCandidates(
        JSON.stringify(record({ phone_normalized: "0311234567" })),
        now,
      ),
    /discovery_intake_phone_invalid/,
  );
});

test("같은 후보 또는 같은 공식 출처·주소는 한 입력에서 한 번만 처리한다", () => {
  const content = [
    record(),
    record({ candidate_id: "d".repeat(64) }),
  ]
    .map((value) => JSON.stringify(value))
    .join("\n");
  const parsed = parseDiscoveryReviewCandidates(content, now);

  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.ineligibleCount, 1);
  assert.deepEqual(parsed.reasonCounts, { DUPLICATE_INPUT: 1 });
});

test("dry-run도 원격 데이터베이스 연결은 시작 전에 거부한다", async () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL =
    "postgresql://runtime:password@remote.example.invalid/platform";
  try {
    await assert.rejects(
      stageDiscoveryReviewCandidates({
        parsed: parseDiscoveryReviewCandidates(JSON.stringify(record()), now),
        dryRun: true,
      }),
      /discovery_intake_database_not_local/,
    );
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

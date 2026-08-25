import assert from "node:assert/strict";
import test from "node:test";

import {
  reviewCauseLabels,
  reviewRiskDescriptions,
  reviewTypeDescriptions,
} from "./review-presentation";

test("검수 대기열의 운영 원인 코드를 사람이 읽을 수 있는 문장으로 표시한다", () => {
  assert.equal(
    reviewCauseLabels.official_business_email_discovered,
    "공식 홈페이지에서 업무용 이메일 발견",
  );
  assert.equal(
    reviewCauseLabels.manual_official_source_candidate,
    "관리자가 공식 출처를 확인해 수동 등록",
  );
  assert.equal(
    reviewCauseLabels.public_correction_request,
    "공개된 업체 정보에 대한 정정 요청 접수",
  );
});

test("위험도와 검수 종류에 모든 운영 분류 설명이 있다", () => {
  assert.deepEqual(Object.keys(reviewRiskDescriptions), ["high", "medium", "low"]);
  assert.deepEqual(Object.keys(reviewTypeDescriptions), [
    "new_office",
    "field_change",
    "closure_suspected",
    "duplicate_suspected",
    "correction_request",
  ]);
});

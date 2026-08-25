const fieldLabels: Record<string, string> = {
  name: "업체명",
  slug: "공개 URL slug",
  summary: "소개",
  phone: "전화번호",
  phoneDisplay: "표시 전화번호",
  phone_display: "표시 전화번호",
  phoneNormalized: "정규화 전화번호",
  phone_normalized: "정규화 전화번호",
  email: "공식 업무용 이메일",
  emailDisplay: "공식 업무용 이메일",
  email_display: "공식 업무용 이메일",
  emailNormalized: "정규화 이메일",
  email_normalized: "정규화 이메일",
  emailKind: "이메일 유형",
  email_kind: "이메일 유형",
  address: "주소",
  addressText: "주소",
  address_text: "주소",
  region: "소재 지역",
  regionSlug: "소재 지역",
  region_slug: "소재 지역",
  serviceCategories: "업무 분야",
  service_categories: "업무 분야",
  serviceCategorySlugs: "업무 분야",
  service_category_slugs: "업무 분야",
  sourceType: "출처 유형",
  source_type: "출처 유형",
  batchId: "배치 ID",
  evidenceNote: "검증 근거 메모",
  distinctBranchReviewed: "공식 지점 구분 검토",
  requestedField: "정정 요청 항목",
  requesterRole: "요청자 관계",
  evidenceUrl: "제안 공개 근거 URL",
  correctionSourceUrl: "운영자 확인 출처 URL",
  correctionSourceType: "운영자 확인 출처 유형",
  status: "공개 상태",
};

export type PresentedReviewValue = {
  field: string;
  label: string;
  value: string;
};

function presentValue(value: unknown) {
  if (value === null) {
    return "없음";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join(", ");
  }

  return null;
}

const fieldValueLabels: Record<string, Record<string, string>> = {
  requestedField: {
    name: "업체명",
    phone: "대표 전화번호",
    address: "주소",
    summary: "소개",
  },
  requesterRole: {
    public_user: "일반 이용자",
    office_representative: "업체 관계자",
    source_operator: "공개 출처 운영자",
    other: "기타",
  },
};

export function presentReviewValues(value: unknown): PresentedReviewValue[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const source = value as Record<string, unknown>;
  const presented: PresentedReviewValue[] = [];

  for (const [field, label] of Object.entries(fieldLabels)) {
    if (!(field in source)) {
      continue;
    }

    const rawValue = source[field];
    const displayValue =
      typeof rawValue === "string" && fieldValueLabels[field]?.[rawValue]
        ? fieldValueLabels[field][rawValue]
        : presentValue(rawValue);

    if (displayValue !== null) {
      presented.push({ field, label, value: displayValue });
    }
  }

  return presented;
}

export const reviewStatusLabels: Record<string, string> = {
  pending: "검수 대기",
  on_hold: "보류",
  approved: "승인",
  approved_with_edits: "수정 후 승인",
  rejected: "반려",
};

export const reviewRiskLabels: Record<string, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};

export const reviewRiskDescriptions: Record<string, string> = {
  high: "상호·전화·주소·업체 동일성처럼 잘못 반영했을 때 영향이 큰 정보",
  medium: "이메일·업무 분야·소개처럼 확인이 필요한 부가 정보",
  low: "표기 통일·공백·단순 오탈자처럼 의미 변화가 작은 정보",
};

export const reviewTypeLabels: Record<string, string> = {
  new_office: "신규 업체",
  field_change: "필드 변경",
  closure_suspected: "폐업 의심",
  duplicate_suspected: "중복 의심",
  correction_request: "정정 요청",
};

export const reviewTypeDescriptions: Record<string, string> = {
  new_office: "아직 등록되지 않은 업체를 새로 공개하려는 후보",
  field_change: "기존 업체의 일부 정보를 추가하거나 변경하려는 후보",
  closure_suspected: "폐업 또는 운영 중단 여부를 추가 확인해야 하는 후보",
  duplicate_suspected: "기존 업체와 같은 업체인지 확인해야 하는 후보",
  correction_request: "사용자 또는 업체 관계자가 공개 정보 수정을 요청한 후보",
};

export const reviewCauseLabels: Record<string, string> = {
  manual_official_source_candidate: "관리자가 공식 출처를 확인해 수동 등록",
  manual_official_source_batch: "사전검증된 공식 출처 후보를 일괄 등록",
  official_business_email_discovered:
    "공식 홈페이지에서 업무용 이메일 발견",
  public_correction_request: "공개된 업체 정보에 대한 정정 요청 접수",
  synthetic_field_change: "합성 검증용 필드 변경",
  synthetic_missing_evidence: "합성 검증용 근거 누락",
  synthetic_new_office: "합성 검증용 신규 업체",
  synthetic_rollback: "합성 검증용 승인 롤백",
  synthetic_duplicate_source_address: "합성 검증용 출처·주소 중복",
};

export const reviewDecisionLabels: Record<string, string> = {
  approved: "승인",
  approved_with_edits: "수정 후 승인",
  rejected: "반려",
  on_hold: "보류",
};

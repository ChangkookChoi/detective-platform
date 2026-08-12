const fieldLabels: Record<string, string> = {
  name: "업체명",
  slug: "공개 URL slug",
  summary: "소개",
  phone: "전화번호",
  phoneDisplay: "표시 전화번호",
  phone_display: "표시 전화번호",
  phoneNormalized: "정규화 전화번호",
  phone_normalized: "정규화 전화번호",
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

export const reviewTypeLabels: Record<string, string> = {
  new_office: "신규 업체",
  field_change: "필드 변경",
  closure_suspected: "폐업 의심",
  duplicate_suspected: "중복 의심",
  correction_request: "정정 요청",
};

export const reviewDecisionLabels: Record<string, string> = {
  approved: "승인",
  approved_with_edits: "수정 후 승인",
  rejected: "반려",
  on_hold: "보류",
};

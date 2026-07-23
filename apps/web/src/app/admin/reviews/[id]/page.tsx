import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireReviewer } from "@/modules/auth/admin-authorization";
import { approvalSourceTypes } from "@/modules/moderation/approve-review";
import {
  presentReviewValues,
  reviewDecisionLabels,
  reviewRiskLabels,
  reviewStatusLabels,
  reviewTypeLabels,
} from "@/modules/moderation/review-presentation";
import {
  getReviewItem,
  listReviewFormOptions,
} from "@/modules/moderation/review-repository";

import {
  approveReviewAction,
  holdReviewAction,
  rejectReviewAction,
} from "./actions";

export const metadata: Metadata = {
  title: "검수 상세",
};

type ReviewDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});
const errorMessages: Record<string, string> = {
  archived_office: "보관 처리된 업체는 공개할 수 없습니다.",
  concurrent_change: "다른 변경이 먼저 저장되었습니다. 최신 내용을 다시 확인하세요.",
  inactive_category: "비활성 업무 분야가 연결되어 있습니다.",
  inactive_region: "비활성 지역이 연결되어 있습니다.",
  invalid_review_item: "현재 상태에서 처리할 수 없는 검수 항목입니다.",
  invalid_edited_values: "수정한 업체 정보의 형식이나 길이를 확인하세요.",
  invalid_proposed_values: "수집 제안값이 공개 가능한 형식이 아닙니다.",
  invalid_slug: "slug는 영문 소문자, 숫자와 하이픈으로 3~80자여야 합니다.",
  invalid_source_type: "지원하지 않는 출처 유형입니다.",
  invalid_source_url: "대표 출처 URL이 안전한 HTTP(S) 주소가 아닙니다.",
  invalid_status: "현재 상태에서 해당 결정을 적용할 수 없습니다.",
  missing_category: "업무 분야가 연결되어 있지 않습니다.",
  missing_collection: "연결된 수집 레코드를 찾을 수 없습니다.",
  missing_evidence: "필수 필드 또는 업무 분야의 출처 근거가 부족합니다.",
  missing_fields: "공개 필수 업체 정보가 부족합니다.",
  missing_primary_source: "확인된 대표 출처가 없습니다.",
  office_not_found: "연결된 업체를 찾을 수 없습니다.",
  region_not_leaf: "소재 지역은 선택 가능한 최하위 행정구역이어야 합니다.",
  restricted_office_status:
    "중지·폐업 의심 업체는 일반 후보 승인으로 다시 공개할 수 없습니다.",
  review_item_not_found: "검수 항목을 찾을 수 없습니다.",
  slug_conflict: "이미 사용 중인 slug입니다.",
  source_already_assigned: "이 출처는 이미 다른 운영 업체에 연결되어 있습니다.",
  source_mismatch: "수집 출처가 연결된 운영 업체의 출처와 일치하지 않습니다.",
  unsupported_review_type: "이 후보 유형은 아직 승인 처리할 수 없습니다.",
};
const riskBadgeClasses: Record<string, string> = {
  high: "bg-rose-100 text-rose-900",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-emerald-100 text-emerald-900",
};

function readSingle(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function reviewValueRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function textValue(value: unknown, fallback: string | null | undefined) {
  return typeof value === "string" ? value : (fallback ?? "");
}

const sourceTypeLabels: Record<string, string> = {
  official_website: "공식 웹사이트",
  public_data: "공공 데이터",
  official_social: "공식 소셜 채널",
  manual_submission: "수동 제출",
  other_public_source: "기타 공개 출처",
};

function ValuesPanel({
  title,
  values,
  emptyMessage,
}: {
  title: string;
  values: ReturnType<typeof presentReviewValues>;
  emptyMessage: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {values.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-slate-500">{emptyMessage}</p>
      ) : (
        <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
          {values.map((item) => (
            <div key={item.field} className="grid gap-2 py-4 sm:grid-cols-[8rem_1fr]">
              <dt className="text-sm font-semibold text-slate-500">
                {item.label}
              </dt>
              <dd className="whitespace-pre-wrap text-sm leading-6 text-slate-900">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export default async function ReviewDetailPage({
  params,
  searchParams,
}: ReviewDetailPageProps) {
  const { id } = await params;
  await requireReviewer(`/admin/reviews/${id}`);
  const [item, query, formOptions] = await Promise.all([
    getReviewItem(id),
    searchParams,
    listReviewFormOptions(),
  ]);

  if (!item) {
    notFound();
  }

  const previousValues = presentReviewValues(item.previousValues);
  const proposedValues = presentReviewValues(item.proposedValues);
  const extractedValues = presentReviewValues(item.collection?.extractedValues);
  const normalizedValues = presentReviewValues(item.collection?.normalizedValues);
  const error = readSingle(query.error);
  const result = readSingle(query.result);
  const canDecide = item.status === "pending" || item.status === "on_hold";
  const isCorrection =
    item.type === "correction_request" && item.office !== null;
  const canApprove =
    canDecide &&
    ((item.collection !== null &&
      (item.type === "new_office" || item.type === "field_change")) ||
      isCorrection);
  const proposedRecord = reviewValueRecord(item.proposedValues);
  const candidateValues = {
    name: textValue(proposedRecord.name, item.office?.name),
    summary: textValue(proposedRecord.summary, item.office?.summary),
    phoneDisplay: textValue(
      proposedRecord.phoneDisplay,
      item.office?.phoneDisplay,
    ),
    addressText: textValue(
      proposedRecord.addressText,
      item.office?.addressText,
    ),
  };
  const isNewCandidate = item.office === null && item.type === "new_office";
  const suggestedEvidenceUrl =
    typeof proposedRecord.evidenceUrl === "string"
      ? proposedRecord.evidenceUrl
      : "";
  const editableFields = {
    name: isNewCandidate || "name" in proposedRecord,
    summary: isNewCandidate || "summary" in proposedRecord,
    phone:
      isNewCandidate ||
      "phoneDisplay" in proposedRecord ||
      "phoneNormalized" in proposedRecord,
    address: isNewCandidate || "addressText" in proposedRecord,
  };

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <Link
          href="/admin/reviews"
          className="text-sm font-semibold text-sky-800 hover:text-sky-950"
        >
          ← 검수 대기열
        </Link>

        <header className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {reviewTypeLabels[item.type] ?? item.type}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                riskBadgeClasses[item.risk] ?? "bg-slate-100 text-slate-900"
              }`}
            >
              위험 {reviewRiskLabels[item.risk] ?? item.risk}
            </span>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-900">
              {reviewStatusLabels[item.status] ?? item.status}
            </span>
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-[-0.04em]">
            {item.office?.name ?? "연결 전 신규 업체 후보"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{item.cause}</p>
          <p className="mt-4 text-xs text-slate-500">
            생성 {dateFormatter.format(item.createdAt)} · 최근 변경{" "}
            {dateFormatter.format(item.updatedAt)}
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-900"
          >
            {errorMessages[error] ?? "검수 결정을 저장하지 못했습니다."}
          </div>
        )}

        {result === "created" && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900"
          >
            신규 업체 후보를 등록했습니다. 원문과 제안값을 대조한 뒤 검수
            결정을 저장하세요.
          </div>
        )}

        {item.submittedByActorId && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-bold">수동 제출 감사 정보</h2>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-[9rem_1fr]">
              <dt className="font-semibold text-slate-500">제출자 ID</dt>
              <dd className="break-all font-mono text-slate-900">
                {item.submittedByActorId}
              </dd>
            </dl>
          </section>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ValuesPanel
            title="이전 값"
            values={previousValues}
            emptyMessage="신규 항목이거나 비교할 이전 값이 없습니다."
          />
          <ValuesPanel
            title="제안 값"
            values={proposedValues}
            emptyMessage="표시 가능한 제안 값이 없습니다. 원인과 출처를 확인하세요."
          />
        </div>

        {item.collection && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">수집 후보</h2>
                {item.collection.collectedAt && (
                  <p className="mt-2 text-xs text-slate-500">
                    수집 {dateFormatter.format(item.collection.collectedAt)}
                  </p>
                )}
              </div>
              {item.collection.isLinkable ? (
                <a
                  href={item.collection.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-sky-800 underline underline-offset-4"
                >
                  수집 출처 열기
                  <span className="sr-only"> 새 창에서 열기</span>
                </a>
              ) : (
                <span className="text-xs font-semibold text-rose-700">
                  안전하지 않은 출처 URL
                </span>
              )}
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <ValuesPanel
                title="추출 값"
                values={extractedValues}
                emptyMessage="표시 가능한 추출 값이 없습니다."
              />
              <ValuesPanel
                title="정규화 값"
                values={normalizedValues}
                emptyMessage="표시 가능한 정규화 값이 없습니다."
              />
            </div>
          </section>
        )}

        {item.office && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-lg font-bold">현재 운영값과 출처</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-500">전화번호</dt>
                <dd className="mt-1 text-slate-900">
                  {item.office.phoneDisplay ?? "없음"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">주소</dt>
                <dd className="mt-1 text-slate-900">
                  {item.office.addressText ?? "없음"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">업무 분야</dt>
                <dd className="mt-1 text-slate-900">
                  {item.office.categories.map((category) => category.name).join(", ") ||
                    "없음"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">최종 확인</dt>
                <dd className="mt-1 text-slate-900">
                  {item.office.lastVerifiedAt
                    ? dateFormatter.format(item.office.lastVerifiedAt)
                    : "없음"}
                </dd>
              </div>
            </dl>
            <ul className="mt-6 space-y-3 border-t border-slate-100 pt-5">
              {item.office.sources.map((source) => (
                <li key={source.id} className="text-sm">
                  {source.isLinkable ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sky-800 underline underline-offset-4"
                    >
                      {source.sourceType}
                      {source.isPrimary ? " · 대표" : ""}
                      <span className="sr-only"> 새 창에서 열기</span>
                    </a>
                  ) : (
                    <span className="font-semibold text-rose-700">
                      안전하지 않은 출처 URL
                    </span>
                  )}
                  <span className="ml-3 text-xs text-slate-500">
                    {source.accessStatus}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canDecide && (
          <section className="mt-6 rounded-2xl border border-slate-300 bg-slate-950 p-6 text-white sm:p-8">
            <h2 className="text-xl font-bold">검수 결정</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              결정 사유는 감사 이력에 남습니다. 출처와 현재값을 확인한 뒤
              처리하세요.
            </p>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {canApprove && (
                <form
                  action={approveReviewAction}
                  className="rounded-xl bg-white p-5 text-slate-950 lg:col-span-2"
                >
                  <input type="hidden" name="reviewItemId" value={item.id} />
                  <input
                    type="hidden"
                    name="expectedReviewUpdatedAt"
                    value={item.updatedAt.toISOString()}
                  />
                  {item.office && (
                    <input
                      type="hidden"
                      name="expectedOfficeUpdatedAt"
                      value={item.office.updatedAt.toISOString()}
                    />
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-sm font-bold">
                      업체명
                      <input
                        name="name"
                        required
                        maxLength={200}
                        defaultValue={candidateValues.name}
                        readOnly={!editableFields.name}
                        className="rounded-lg border border-slate-300 p-3 font-normal outline-none read-only:bg-slate-100 focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold">
                      대표 전화번호
                      <input
                        name="phoneDisplay"
                        required
                        maxLength={50}
                        defaultValue={candidateValues.phoneDisplay}
                        readOnly={!editableFields.phone}
                        className="rounded-lg border border-slate-300 p-3 font-normal outline-none read-only:bg-slate-100 focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold md:col-span-2">
                      주소
                      <input
                        name="addressText"
                        required
                        maxLength={500}
                        defaultValue={candidateValues.addressText}
                        readOnly={!editableFields.address}
                        className="rounded-lg border border-slate-300 p-3 font-normal outline-none read-only:bg-slate-100 focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold md:col-span-2">
                      소개
                      <textarea
                        name="summary"
                        maxLength={2000}
                        rows={4}
                        defaultValue={candidateValues.summary}
                        readOnly={!editableFields.summary}
                        className="rounded-lg border border-slate-300 p-3 font-normal outline-none read-only:bg-slate-100 focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                      />
                    </label>
                  </div>
                  {isNewCandidate && (
                    <fieldset className="mt-6 grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-2">
                      <legend className="px-2 text-sm font-bold">
                        신규 운영 업체 설정
                      </legend>
                      <label className="grid gap-2 text-sm font-bold">
                        공개 URL slug
                        <input
                          name="slug"
                          required
                          minLength={3}
                          maxLength={80}
                          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                          placeholder="sample-office"
                          className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-bold">
                        소재 지역
                        <select
                          name="regionSlug"
                          required
                          defaultValue=""
                          className="rounded-lg border border-slate-300 bg-white p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                        >
                          <option value="" disabled>
                            최하위 행정구역 선택
                          </option>
                          {formOptions.regions.map((region) => (
                            <option key={region.slug} value={region.slug}>
                              {region.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm font-bold">
                        대표 출처 유형
                        <select
                          name="sourceType"
                          defaultValue="official_website"
                          className="rounded-lg border border-slate-300 bg-white p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                        >
                          {approvalSourceTypes.map((sourceType) => (
                            <option key={sourceType} value={sourceType}>
                              {sourceTypeLabels[sourceType]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset className="rounded-lg border border-slate-300 p-4">
                        <legend className="px-2 text-sm font-bold">
                          업무 분야
                        </legend>
                        <div className="grid gap-3">
                          {formOptions.categories.map((category) => (
                            <label
                              key={category.slug}
                              className="flex items-center gap-3 text-sm font-normal"
                            >
                              <input
                                type="checkbox"
                                name="serviceCategorySlugs"
                                value={category.slug}
                              />
                              {category.name}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </fieldset>
                  )}
                  {isCorrection && (
                    <fieldset className="mt-6 grid gap-4 border-t border-slate-200 pt-6 md:grid-cols-2">
                      <legend className="px-2 text-sm font-bold">
                        운영자 확인 출처
                      </legend>
                      <label className="grid gap-2 text-sm font-bold md:col-span-2">
                        직접 확인한 공개 출처 URL
                        <input
                          type="url"
                          name="correctionSourceUrl"
                          required
                          maxLength={2048}
                          defaultValue={suggestedEvidenceUrl}
                          placeholder="https://"
                          className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                        />
                        <span className="text-xs font-normal leading-5 text-slate-500">
                          요청자가 제안한 URL은 미검증 값입니다. 운영자가 실제로
                          확인한 URL을 입력해야 필드 근거로 기록됩니다.
                        </span>
                      </label>
                      <label className="grid gap-2 text-sm font-bold">
                        확인 출처 유형
                        <select
                          name="correctionSourceType"
                          defaultValue="official_website"
                          className="rounded-lg border border-slate-300 bg-white p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                        >
                          {approvalSourceTypes.map((sourceType) => (
                            <option key={sourceType} value={sourceType}>
                              {sourceTypeLabels[sourceType]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </fieldset>
                  )}
                  <label className="mt-6 grid gap-2 text-sm font-bold">
                    승인 사유
                    <textarea
                      name="reason"
                      required
                      minLength={5}
                      maxLength={1000}
                      rows={4}
                      className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>
                  <p className="mt-4 text-xs leading-5 text-slate-600">
                    그대로 승인은 DB의 제안값을 사용합니다. 수정 후 승인은 위에서
                    허용된 필드의 입력값과 편집 스냅샷을 감사 이력에 저장합니다.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="submit"
                      name="decision"
                      value="approved"
                      className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800"
                    >
                      제안값 그대로 승인·공개
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="approved_with_edits"
                      className="rounded-lg bg-sky-700 px-4 py-3 text-sm font-bold text-white hover:bg-sky-800"
                    >
                      수정 후 승인·공개
                    </button>
                  </div>
                </form>
              )}
              {item.status === "pending" && (
                <form action={holdReviewAction} className="rounded-xl bg-white p-5 text-slate-950">
                  <input type="hidden" name="reviewItemId" value={item.id} />
                  <input
                    type="hidden"
                    name="expectedReviewUpdatedAt"
                    value={item.updatedAt.toISOString()}
                  />
                  <label className="grid gap-2 text-sm font-bold">
                    보류 사유
                    <textarea
                      name="reason"
                      required
                      minLength={5}
                      maxLength={1000}
                      rows={4}
                      className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                    />
                  </label>
                  <button
                    type="submit"
                    className="mt-4 w-full rounded-lg bg-amber-600 px-4 py-3 text-sm font-bold text-white hover:bg-amber-700"
                  >
                    보류
                  </button>
                </form>
              )}
              <form action={rejectReviewAction} className="rounded-xl bg-white p-5 text-slate-950">
                <input type="hidden" name="reviewItemId" value={item.id} />
                <input
                  type="hidden"
                  name="expectedReviewUpdatedAt"
                  value={item.updatedAt.toISOString()}
                />
                <label className="grid gap-2 text-sm font-bold">
                  반려 사유
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                    rows={4}
                    className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                  />
                </label>
                <button
                  type="submit"
                  className="mt-4 w-full rounded-lg bg-rose-700 px-4 py-3 text-sm font-bold text-white hover:bg-rose-800"
                >
                  반려
                </button>
              </form>
            </div>
            {!canApprove && (
              <p className="mt-4 text-xs leading-5 text-amber-200">
                신규·필드 변경 후보는 수집 레코드가 필요하고, 정정 요청은 공개
                업체 연결이 필요합니다. 그 외 후보는 보류 또는 반려 후 별도
                절차로 처리하세요.
              </p>
            )}
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <h2 className="text-lg font-bold">감사 이력</h2>
          {item.actions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">아직 기록된 결정이 없습니다.</p>
          ) : (
            <ol className="mt-5 space-y-4">
              {item.actions.map((action) => (
                <li key={action.id} className="border-l-2 border-slate-200 pl-4">
                  <p className="text-sm font-bold">
                    {reviewDecisionLabels[action.decision] ?? action.decision}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">
                    {action.reason}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {action.actorId} · {dateFormatter.format(action.createdAt)}
                  </p>
                  {presentReviewValues(action.editedValues).length > 0 && (
                    <dl className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                      {presentReviewValues(action.editedValues).map((value) => (
                        <div
                          key={value.field}
                          className="grid gap-1 sm:grid-cols-[8rem_1fr]"
                        >
                          <dt className="font-semibold text-slate-500">
                            {value.label}
                          </dt>
                          <dd className="text-slate-800">{value.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { requireReviewer } from "@/modules/auth/admin-authorization";

import { createManualOfficeCandidateAction } from "./actions";

export const metadata: Metadata = {
  title: "신규 업체 후보 등록",
};

type NewReviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  duplicate:
    "같은 공식 출처 URL과 소재지 주소의 미처리 신규 후보가 이미 있습니다.",
  invalid_actor: "로그인한 운영자 정보를 확인할 수 없습니다.",
  invalid_address: "주소는 공백을 제외하고 5~500자로 입력하세요.",
  invalid_name: "업체명은 공백을 제외하고 2~200자로 입력하세요.",
  invalid_phone: "국내 대표 전화번호 형식을 확인하세요.",
  invalid_source_url: "공식 출처는 안전한 HTTP(S) URL이어야 합니다.",
  official_source_confirmation_required:
    "공식 운영 주체와 정확한 한 개 사무소의 공개 정보를 확인하세요.",
  sensitive_content_confirmation_required:
    "사건·상담·개인 연락처 등 민감정보가 없음을 확인하세요.",
};

function readSingle(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function NewReviewPage({
  searchParams,
}: NewReviewPageProps) {
  await requireReviewer("/admin/reviews/new");
  const query = await searchParams;
  const error = readSingle(query.error);

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <Link
          href="/admin/reviews"
          className="text-sm font-semibold text-sky-800 hover:text-sky-950"
        >
          ← 검수 대기열
        </Link>

        <header className="mt-6">
          <p className="text-sm font-bold tracking-[0.14em] text-sky-800">
            MANUAL INTAKE
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            신규 업체 후보 등록
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            자동 추출이 어려운 공식 공개 출처를 고위험 검수 후보로만
            등록합니다. 이 단계에서는 업체가 생성되거나 공개되지 않습니다.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-900"
          >
            {errorMessages[error] ?? "후보를 등록하지 못했습니다."}
          </div>
        )}

        <form
          action={createManualOfficeCandidateAction}
          className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <label className="grid gap-2 text-sm font-bold">
            공식 출처 URL
            <input
              name="sourceUrl"
              type="url"
              inputMode="url"
              required
              maxLength={2000}
              placeholder="https://example.com/"
              className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
            />
            <span className="font-normal leading-5 text-slate-500">
              사업자 또는 지점 운영 주체가 직접 관리하는 공개 페이지인지 먼저
              확인하세요.
            </span>
          </label>

          <label className="grid gap-2 text-sm font-bold">
            업체명
            <input
              name="name"
              required
              minLength={2}
              maxLength={200}
              className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold">
            대표 전화번호
            <input
              name="phoneDisplay"
              type="tel"
              required
              minLength={9}
              maxLength={50}
              placeholder="031-000-0000"
              className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="grid gap-2 text-sm font-bold">
            소재지 주소
            <textarea
              name="addressText"
              required
              minLength={5}
              maxLength={500}
              rows={3}
              className="resize-y rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-bold">등록 전 필수 확인</legend>
            <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
              <input
                name="officialSourceConfirmed"
                type="checkbox"
                required
                className="mt-1 size-4 shrink-0 accent-sky-800"
              />
              <span>
                사업자 또는 지점 운영 주체가 직접 관리하는 출처이며, 정확한 한
                개 사무소의 업체명·대표 전화·주소임을 원문에서 확인했습니다.
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
              <input
                name="sensitiveContentConfirmed"
                type="checkbox"
                required
                className="mt-1 size-4 shrink-0 accent-sky-800"
              />
              <span>
                사건·상담 내용, 조사 대상자 정보, 개인 연락처와 소개
                문구·이미지를 입력하지 않았습니다.
              </span>
            </label>
          </fieldset>

          <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            소개 문구, 이미지, 상담 내용, 개인 연락처는 입력하지 않습니다.
            등록 후 원문·지역·업무 분야를 다시 확인하고 승인 또는
            보류·반려하세요.
          </aside>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link
              href="/admin/reviews"
              className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700"
            >
              취소
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-sky-900"
            >
              검수 후보로 등록
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

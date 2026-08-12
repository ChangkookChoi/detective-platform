import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicOfficeBySlug } from "@/modules/directory/public-office-repository";

import { createCorrectionRequestAction } from "./actions";

export const metadata: Metadata = {
  title: "업체 정보 수정 요청",
  description: "공개된 업체 정보의 오류를 운영자에게 알려 주세요.",
  robots: { index: false, follow: false },
};

type CorrectionPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  duplicate: "같은 내용의 요청이 이미 접수되어 검토 중입니다.",
  invalid_input: "입력한 항목과 공개 근거 URL의 형식을 확인해 주세요.",
  office_not_found: "수정 요청을 받을 수 있는 공개 업체가 아닙니다.",
  rate_limited:
    "이 업체에 대한 요청이 짧은 시간에 많이 접수되었습니다. 잠시 뒤 다시 시도해 주세요.",
  sensitive_confirmation_required:
    "민감정보를 포함하지 않았다는 확인이 필요합니다.",
};

function readSingle(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function CorrectionPage({
  params,
  searchParams,
}: CorrectionPageProps) {
  const { slug } = await params;
  const [office, query] = await Promise.all([
    getPublicOfficeBySlug(slug),
    searchParams,
  ]);

  if (!office) {
    notFound();
  }

  const action = createCorrectionRequestAction.bind(null, slug);
  const error = readSingle(query.error);
  const submitted = readSingle(query.result) === "submitted";

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <Link
          href={`/offices/${office.slug}`}
          className="text-sm font-semibold text-sky-800 hover:text-sky-950"
        >
          ← {office.name} 상세
        </Link>

        <header className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <p className="text-sm font-bold text-sky-800">공개 정보 정정 요청</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em]">
            {office.name}
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            업체명, 대표 전화, 주소, 소개 중 잘못된 공개 정보를 알려 주세요.
            접수 내용은 바로 공개되지 않으며 운영자가 공개 출처를 확인한 뒤
            검수합니다.
          </p>
        </header>

        {submitted && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900"
          >
            수정 요청을 접수했습니다. 별도의 처리 결과 연락은 제공하지 않습니다.
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-900"
          >
            {errorMessages[error] ?? "수정 요청을 접수하지 못했습니다."}
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <h2 className="font-bold">사건·상담 내용은 입력하지 마세요</h2>
          <p className="mt-2">
            조사 대상자, 가족, 의뢰인 등 개인의 이름·연락처·주소와 사건 내용,
            상담 내용, 민감정보는 받지 않습니다. 요청자 연락처도 수집하지
            않으므로 공개된 업체 정보와 공개 근거만 입력해 주세요.
          </p>
        </section>

        {!submitted && (
          <form
            action={action}
            className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
          >
            <div className="grid gap-5">
              <label className="grid gap-2 text-sm font-bold">
                수정할 항목
                <select
                  name="field"
                  required
                  defaultValue=""
                  className="rounded-lg border border-slate-300 bg-white p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="" disabled>
                    항목 선택
                  </option>
                  <option value="name">업체명</option>
                  <option value="phone">대표 전화번호</option>
                  <option value="address">주소</option>
                  <option value="summary">소개</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-bold">
                올바른 공개 정보
                <textarea
                  name="suggestedValue"
                  required
                  maxLength={2000}
                  rows={4}
                  placeholder="선택한 항목에 적용할 공개 정보만 입력해 주세요."
                  className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="grid gap-2 text-sm font-bold">
                공개 근거 URL <span className="font-normal">(선택)</span>
                <input
                  type="url"
                  name="evidenceUrl"
                  maxLength={2048}
                  placeholder="https://"
                  className="rounded-lg border border-slate-300 p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                />
                <span className="text-xs font-normal leading-5 text-slate-500">
                  업체 공식 사이트나 공공 자료처럼 누구나 확인 가능한 주소만
                  입력해 주세요. 제출한 URL 자체는 검증된 근거로 간주하지
                  않습니다.
                </span>
              </label>

              <label className="grid gap-2 text-sm font-bold">
                요청자 관계
                <select
                  name="requesterRole"
                  required
                  defaultValue="public_user"
                  className="rounded-lg border border-slate-300 bg-white p-3 font-normal outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="public_user">일반 이용자</option>
                  <option value="office_representative">업체 관계자</option>
                  <option value="source_operator">공개 출처 운영자</option>
                  <option value="other">기타</option>
                </select>
                <span className="text-xs font-normal leading-5 text-slate-500">
                  이 선택만으로 업체 관계자 권한이 확인되지는 않습니다.
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6">
                <input
                  type="checkbox"
                  name="sensitiveContentConfirmed"
                  value="confirmed"
                  required
                  className="mt-1 size-4 shrink-0"
                />
                <span>
                  사건·상담 내용과 개인의 이름, 연락처, 주소 등 민감정보를
                  포함하지 않았음을 확인합니다.
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="mt-6 w-full rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-sky-800"
            >
              수정 요청 접수
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

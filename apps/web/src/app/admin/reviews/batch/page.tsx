import type { Metadata } from "next";
import Link from "next/link";

import { requireReviewer } from "@/modules/auth/admin-authorization";
import { listOfficeReviewBatch } from "@/modules/moderation/office-review-batch";

import {
  approveOfficeReviewBatchAction,
  createOfficeReviewBatchAction,
} from "./actions";

export const metadata: Metadata = { title: "업체 후보 일괄 검수" };

type BatchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errors: Record<string, string> = {
  batch_not_found: "해당 배치의 검수 후보를 찾지 못했습니다.",
  batch_too_large: "한 배치는 1~50개 후보만 처리할 수 있습니다.",
  candidate_not_in_batch: "선택 항목에 다른 배치 후보가 포함되어 있습니다.",
  confirmation_required: "공식 출처·민감정보·최종 검수 확인이 필요합니다.",
  duplicate_candidate: "manifest 안의 공식 출처 URL 또는 slug가 중복됩니다.",
  invalid_batch: "manifest 형식과 후보 값을 확인하세요.",
  invalid_preflight: "manifest와 일치하는 사전검증 파일인지 확인하세요.",
  no_candidate_selected: "승인할 후보를 한 건 이상 선택하세요.",
  preflight_expired: "사전검증 결과가 24시간을 지났습니다. 다시 실행하세요.",
  preflight_failed: "사전검증을 통과하지 못한 후보가 포함되어 있습니다.",
};

function readSingle(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function readCount(value: string | undefined) {
  return value && /^\d+$/.test(value) ? Number(value) : 0;
}

export default async function OfficeReviewBatchPage({
  searchParams,
}: BatchPageProps) {
  await requireReviewer("/admin/reviews/batch");
  const query = await searchParams;
  const batchId = readSingle(query.batchId);
  const error = readSingle(query.error);
  const result = readSingle(query.result);
  const rows = batchId ? await listOfficeReviewBatch(batchId) : [];
  const actionableRows = rows.filter(
    (row) => row.status === "pending" || row.status === "on_hold",
  );

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <Link
          href="/admin/reviews"
          className="text-sm font-semibold text-sky-800 hover:text-sky-950"
        >
          ← 검수 대기열
        </Link>
        <header className="mt-6">
          <p className="text-sm font-bold tracking-[0.14em] text-sky-800">
            BATCH MODERATION
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
            업체 후보 일괄 검수
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            24시간 이내 사전검증을 통과한 manifest를 한 번에 비공개 후보로
            등록하고, 원문 대조가 끝난 정상 건만 선택해 한 번에 승인합니다.
          </p>
        </header>

        {error ? (
          <div role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
            {errors[error] ?? "배치 작업을 처리하지 못했습니다."}
          </div>
        ) : null}
        {result === "created" ? (
          <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
            신규 {readCount(readSingle(query.created))}건을 등록했고, 기존 미처리
            후보 {readCount(readSingle(query.existing))}건은 재사용했습니다. 이미
            정확히 공개된 {readCount(readSingle(query.published))}건은 건너뛰었습니다.
          </div>
        ) : null}
        {result === "approved" || result === "partial" ? (
          <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
            {readCount(readSingle(query.approved))}건을 승인·공개했습니다.
            {result === "partial"
              ? ` 실패 ${readCount(readSingle(query.failed))}건은 미처리 상태로 남겼습니다.`
              : null}
          </div>
        ) : null}

        <form
          action={createOfficeReviewBatchAction}
          className="mt-8 grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold">
              후보 manifest JSON
              <input name="manifest" type="file" accept="application/json,.json" required className="rounded-lg border border-slate-300 p-3 font-normal" />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              사전검증 JSON
              <input name="preflight" type="file" accept="application/json,.json" required className="rounded-lg border border-slate-300 p-3 font-normal" />
            </label>
          </div>
          <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-bold">일괄 등록 확인</legend>
            <label className="flex items-start gap-3 text-sm leading-6">
              <input name="officialSourceConfirmed" type="checkbox" required className="mt-1 size-4 accent-sky-800" />
              각 후보가 공식 운영 주체의 정확한 한 사무소 정보임을 확인했습니다.
            </label>
            <label className="flex items-start gap-3 text-sm leading-6">
              <input name="sensitiveContentConfirmed" type="checkbox" required className="mt-1 size-4 accent-sky-800" />
              사건·상담·개인 연락처 등 민감정보가 없음을 확인했습니다.
            </label>
          </fieldset>
          <button type="submit" className="justify-self-end rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-sky-900">
            검수 후보 일괄 등록
          </button>
        </form>

        {batchId ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">배치 {batchId}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  전체 {rows.length}건 · 승인 가능 {actionableRows.length}건
                </p>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">등록된 후보가 없습니다.</p>
            ) : (
              <form action={approveOfficeReviewBatchAction} className="mt-6">
                <input type="hidden" name="batchId" value={batchId} />
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[56rem] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="p-3">선택</th><th className="p-3">업체</th><th className="p-3">소재지</th><th className="p-3">업무 분야</th><th className="p-3">근거 메모</th><th className="p-3">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row) => {
                        const actionable = row.status === "pending" || row.status === "on_hold";
                        return (
                          <tr key={row.id}>
                            <td className="p-3"><input type="checkbox" name="reviewItemIds" value={row.id} defaultChecked={actionable} disabled={!actionable} aria-label={`${row.metadata.name} 승인 선택`} /></td>
                            <td className="p-3"><Link href={`/admin/reviews/${row.id}`} className="font-bold text-sky-800 underline underline-offset-4">{row.metadata.name}</Link><span className="mt-1 block text-xs text-slate-500">{row.metadata.phoneDisplay}</span></td>
                            <td className="p-3">{row.metadata.regionSlug}<span className="mt-1 block max-w-56 text-xs text-slate-500">{row.metadata.addressText}</span></td>
                            <td className="p-3">{row.metadata.serviceCategorySlugs.join(", ")}</td>
                            <td className="max-w-72 p-3 text-xs leading-5 text-slate-600">{row.metadata.evidenceNote}</td>
                            <td className="p-3 font-semibold">{row.status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {actionableRows.length > 0 ? (
                  <div className="mt-6 grid gap-4">
                    <label className="grid gap-2 text-sm font-bold">
                      일괄 승인 사유
                      <textarea name="reason" required minLength={5} maxLength={1000} rows={3} defaultValue={`${batchId} 묶음 검수: 공식 원문과 최소 사실 필드·소재지·업무 분야를 대조했습니다.`} className="rounded-lg border border-slate-300 p-3 font-normal" />
                    </label>
                    <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                      <input name="reviewedValuesConfirmed" type="checkbox" required className="mt-1 size-4 accent-amber-700" />
                      선택한 모든 업체의 행별 값과 공식 출처를 확인했으며, 각 업체에 동일한 사유로 개별 승인 감사 이력을 남기는 것에 동의합니다.
                    </label>
                    <button type="submit" className="justify-self-end rounded-lg bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800">
                      선택한 정상 후보 일괄 승인·공개
                    </button>
                  </div>
                ) : null}
              </form>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

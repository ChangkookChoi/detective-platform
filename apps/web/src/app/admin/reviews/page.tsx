import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireReviewer } from "@/modules/auth/admin-authorization";
import {
  reviewRiskLabels,
  reviewStatusLabels,
  reviewTypeLabels,
} from "@/modules/moderation/review-presentation";
import {
  listReviewQueue,
  ReviewQueueFilterError,
  type ReviewQueueStatus,
} from "@/modules/moderation/review-repository";

export const metadata: Metadata = {
  title: "검수 대기열",
};

type ReviewQueuePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statuses: ReviewQueueStatus[] = [
  "pending",
  "on_hold",
  "approved",
  "approved_with_edits",
  "rejected",
];
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function readSingle(value: string | string[] | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    notFound();
  }

  return value;
}

async function loadQueue(status: string) {
  try {
    return await listReviewQueue(status);
  } catch (error) {
    if (error instanceof ReviewQueueFilterError) {
      notFound();
    }

    throw error;
  }
}

export default async function ReviewQueuePage({
  searchParams,
}: ReviewQueuePageProps) {
  await requireReviewer("/admin/reviews");
  const query = await searchParams;
  const status = readSingle(query.status) ?? "pending";
  const result = readSingle(query.result);
  const items = await loadQueue(status);

  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-bold tracking-[0.14em] text-sky-800">
              MODERATION
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em]">
              검수 대기열
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              위험도가 높은 항목부터, 같은 위험도에서는 오래된 항목부터
              표시합니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm">
              {items.length}건
            </p>
            <Link
              href="/admin/reviews/batch"
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-slate-950"
            >
              후보 일괄 검수
            </Link>
            <Link
              href="/admin/reviews/new"
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-sky-900"
            >
              신규 후보 등록
            </Link>
          </div>
        </div>

        {result && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900"
          >
            검수 결정이 저장되었습니다.
          </div>
        )}

        <nav aria-label="검수 상태" className="mt-8 flex flex-wrap gap-2">
          {statuses.map((item) => (
            <Link
              key={item}
              href={item === "pending" ? "/admin/reviews" : `/admin/reviews?status=${item}`}
              aria-current={status === item ? "page" : undefined}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                status === item
                  ? "bg-slate-950 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:border-slate-950"
              }`}
            >
              {reviewStatusLabels[item]}
            </Link>
          ))}
        </nav>

        {items.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <h2 className="text-xl font-bold">해당 상태의 검수 항목이 없습니다.</h2>
          </section>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/admin/reviews/${item.id}`}
                    className="grid gap-4 px-5 py-5 transition hover:bg-sky-50 sm:grid-cols-[7rem_8rem_minmax(0,1fr)_auto] sm:items-center sm:px-6"
                  >
                    <span
                      className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
                        item.risk === "high"
                          ? "bg-rose-100 text-rose-900"
                          : item.risk === "medium"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      위험 {reviewRiskLabels[item.risk] ?? item.risk}
                    </span>
                    <span className="text-sm font-semibold text-slate-600">
                      {reviewTypeLabels[item.type] ?? item.type}
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-base text-slate-950">
                        {item.office?.name ?? "연결 전 신규 후보"}
                      </strong>
                      <span className="mt-1 block truncate text-sm text-slate-500">
                        {item.cause}
                      </span>
                    </span>
                    <time
                      dateTime={item.createdAt.toISOString()}
                      className="text-xs text-slate-500"
                    >
                      {dateFormatter.format(item.createdAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

import type { ReviewSourceEvidenceRow } from "@/modules/moderation/review-source-evidence";

const statusPresentation: Record<
  ReviewSourceEvidenceRow["status"],
  { label: string; className: string }
> = {
  match: {
    label: "값 일치",
    className: "bg-emerald-100 text-emerald-900",
  },
  different: {
    label: "값 다름",
    className: "bg-rose-100 text-rose-900",
  },
  missing_candidate: {
    label: "후보값 없음",
    className: "bg-amber-100 text-amber-950",
  },
  missing_source: {
    label: "출처값 없음",
    className: "bg-amber-100 text-amber-950",
  },
  unavailable: {
    label: "양쪽 모두 없음",
    className: "bg-slate-100 text-slate-700",
  },
};

function sourceHost(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "확인할 수 없는 주소";
  }
}

export function SourceEvidencePreview({
  sourceUrl,
  isLinkable,
  sourceTypeLabel,
  collectedAtLabel,
  evidenceNote,
  rows,
}: {
  sourceUrl: string;
  isLinkable: boolean;
  sourceTypeLabel: string;
  collectedAtLabel: string | null;
  evidenceNote: string | null;
  rows: ReviewSourceEvidenceRow[];
}) {
  return (
    <section
      aria-labelledby="source-evidence-heading"
      className="mt-6 overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm"
    >
      <div className="border-b border-sky-100 bg-sky-50 px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-800">
              {sourceTypeLabel}
            </p>
            <h2 id="source-evidence-heading" className="mt-2 text-xl font-bold">
              공식 출처 증거 미리보기
            </h2>
            <p className="mt-2 break-all text-sm text-slate-600">
              {sourceHost(sourceUrl)}
              {collectedAtLabel ? ` · 수집 ${collectedAtLabel}` : ""}
            </p>
          </div>
          {isLinkable ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-sky-800 px-4 py-3 text-sm font-bold text-white hover:bg-sky-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-800"
            >
              공식 홈페이지 원문 열기
              <span className="sr-only"> 새 창에서 열기</span>
            </a>
          ) : (
            <span className="rounded-lg bg-rose-100 px-4 py-3 text-sm font-bold text-rose-900">
              안전하지 않은 출처 URL
            </span>
          )}
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-600">
          외부 페이지의 스크립트를 검수 화면에서 실행하지 않고 저장된 최소
          추출값만 비교합니다. ‘값 일치’는 저장된 두 값이 같다는 뜻이며 공식성이나
          최신성을 자동 보증하지 않습니다.
        </p>
      </div>

      <div className="px-6 py-6 sm:px-8">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-left text-sm">
            <caption className="sr-only">
              검수 후보값과 공식 출처 추출값 비교
            </caption>
            <thead>
              <tr className="text-xs text-slate-500">
                <th scope="col" className="border-b border-slate-200 pb-3 pr-4 font-bold">
                  검수 항목
                </th>
                <th scope="col" className="border-b border-slate-200 px-4 pb-3 font-bold">
                  후보값
                </th>
                <th scope="col" className="border-b border-slate-200 px-4 pb-3 font-bold">
                  출처에서 추출한 값
                </th>
                <th scope="col" className="border-b border-slate-200 pl-4 pb-3 font-bold">
                  비교
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = statusPresentation[row.status];

                return (
                  <tr key={row.field}>
                    <th scope="row" className="border-b border-slate-100 py-4 pr-4 font-bold text-slate-700">
                      {row.label}
                    </th>
                    <td className="whitespace-pre-wrap border-b border-slate-100 px-4 py-4 text-slate-900">
                      {row.candidateValue ?? "없음"}
                    </td>
                    <td className="whitespace-pre-wrap border-b border-slate-100 px-4 py-4 text-slate-900">
                      {row.sourceValue ?? "없음"}
                    </td>
                    <td className="border-b border-slate-100 py-4 pl-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {evidenceNote && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-bold text-slate-800">검증 근거 메모</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {evidenceNote}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

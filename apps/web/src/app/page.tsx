import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const steps = [
  ["01", "조건 선택", "사무소 소재 지역과 필요한 업무 분야를 선택합니다."],
  ["02", "정보 비교", "주소, 취급 업무, 출처와 확인일을 비교합니다."],
  ["03", "직접 연락", "플랫폼 연결 수수료 없이 대표 번호로 전화합니다."],
] as const;

export default function Home() {
  return (
    <main className="flex-1">
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_#e0f2fe,_transparent_38%),linear-gradient(135deg,#ffffff_20%,#f8fafc_75%)]">
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
          <div>
            <p className="mb-5 text-sm font-bold tracking-[0.18em] text-sky-800">
              서울·경기 탐정사무소 정보
            </p>
            <h1 className="max-w-3xl text-4xl font-bold leading-[1.15] tracking-[-0.045em] text-slate-950 sm:text-6xl">
              민감한 내용을 남기지 않고, 확인된 업체 정보를 살펴보세요.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">
              사무소 소재 지역과 업무 분야로 공개 승인된 업체를 찾고, 정보
              출처와 최종 확인일을 비교한 뒤 직접 전화할 수 있습니다.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/offices"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-base font-bold text-white transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
              >
                업체 찾아보기
                <span aria-hidden="true" className="ml-2">
                  →
                </span>
              </Link>
              <span className="text-sm leading-6 text-slate-600">
                회원가입·사건 접수 없이 이용
              </span>
            </div>
          </div>
          <aside className="rounded-3xl border border-slate-200 bg-white/90 p-7 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.35)]">
            <p className="text-sm font-bold text-sky-800">정보 확인 기준</p>
            <ul className="mt-5 space-y-5 text-sm leading-6 text-slate-700">
              <li className="border-l-2 border-sky-300 pl-4">
                관리자 검수를 통과해 공개 상태인 업체만 표시합니다.
              </li>
              <li className="border-l-2 border-sky-300 pl-4">
                업체별 출처 URL과 최종 확인일을 함께 제공합니다.
              </li>
              <li className="border-l-2 border-sky-300 pl-4">
                목록 순서는 추천이나 품질 순위가 아닙니다.
              </li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map(([number, title, description]) => (
            <article
              key={number}
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <p className="text-xs font-bold tracking-[0.15em] text-sky-700">
                STEP {number}
              </p>
              <h2 className="mt-4 text-xl font-bold tracking-[-0.025em]">
                {title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

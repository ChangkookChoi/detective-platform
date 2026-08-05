import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TrackedPhoneLink } from "@/modules/analytics/office-engagement";
import {
  listPublicDirectoryFilterOptions,
  listPublicOffices,
  PublicDirectoryFilterError,
} from "@/modules/directory/public-office-repository";

type OfficesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: OfficesPageProps): Promise<Metadata> {
  const query = await searchParams;
  const hasFilter = Boolean(query.region || query.category);

  return {
    title: "업체 찾기",
    description:
      "서울·경기 지역과 업무 분야로 공개 승인된 탐정사무소 정보를 찾아보세요.",
    alternates: { canonical: "/offices" },
    ...(hasFilter ? { robots: { index: false, follow: true } } : {}),
  };
}

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

function readFilter(value: string | string[] | undefined) {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    notFound();
  }

  return value;
}

async function loadDirectory(region?: string, category?: string) {
  try {
    const [filterOptions, officeItems] = await Promise.all([
      listPublicDirectoryFilterOptions(),
      listPublicOffices({ region, category, limit: 100 }),
    ]);

    return { filterOptions, officeItems };
  } catch (error) {
    if (error instanceof PublicDirectoryFilterError) {
      notFound();
    }

    throw error;
  }
}

export default async function OfficesPage({ searchParams }: OfficesPageProps) {
  const query = await searchParams;
  const region = readFilter(query.region);
  const category = readFilter(query.category);

  const { filterOptions, officeItems } = await loadDirectory(region, category);

  return (
      <main className="flex-1">
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
            <p className="text-sm font-bold tracking-[0.14em] text-sky-800">
              PUBLIC DIRECTORY
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
              업체 찾기
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
              공개 검수를 마친 업체만 표시합니다. 지역은 서비스 가능 범위가
              아닌, 확인된 사무소 소재지를 기준으로 합니다.
            </p>
          </div>
        </section>

        <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
          <form
            action="/offices"
            className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6"
          >
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              소재 지역
              <select
                name="region"
                defaultValue={region ?? ""}
                className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-normal text-slate-950 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">서울·경기 전체</option>
                {filterOptions.regions.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              업무 분야
              <select
                name="category"
                defaultValue={category ?? ""}
                className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-base font-normal text-slate-950 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">전체 업무 분야</option>
                {filterOptions.categories.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="min-h-12 rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            >
              조건 적용
            </button>
          </form>

          <div className="mt-10 flex items-end justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <p className="text-sm text-slate-500">검색 결과</p>
              <h2 className="mt-1 text-2xl font-bold tracking-[-0.025em]">
                {officeItems.length}개 업체
              </h2>
            </div>
            {(region || category) && (
              <Link
                href="/offices"
                className="text-sm font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950"
              >
                조건 초기화
              </Link>
            )}
          </div>

          {officeItems.length === 0 ? (
            <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <h2 className="text-xl font-bold">조건에 맞는 업체가 없습니다.</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
                지역 또는 업무 분야 조건을 하나씩 해제해 보세요. 조건과 무관한
                업체를 임의로 추천하지 않습니다.
              </p>
              <Link
                href="/offices"
                className="mt-6 inline-flex rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-800 hover:border-slate-950"
              >
                전체 조건 보기
              </Link>
            </section>
          ) : (
            <ul className="mt-6 grid gap-5 lg:grid-cols-2">
              {officeItems.map((office) => (
                <li key={office.id}>
                  <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-sky-300 hover:shadow-[0_18px_45px_-30px_rgba(14,116,144,0.5)]">
                    <div className="flex flex-wrap gap-2">
                      {office.categories.map((item) => (
                        <span
                          key={item.slug}
                          className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900"
                        >
                          {item.name}
                        </span>
                      ))}
                    </div>
                    <h3 className="mt-5 text-xl font-bold tracking-[-0.025em]">
                      <Link
                        href={`/offices/${office.slug}`}
                        className="hover:text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700"
                      >
                        {office.name}
                      </Link>
                    </h3>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {office.region.name}
                    </p>
                    {office.summary && (
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                        {office.summary}
                      </p>
                    )}
                    <dl className="mt-6 grid gap-3 border-t border-slate-100 pt-5 text-sm">
                      <div className="grid grid-cols-[5.5rem_1fr] gap-3">
                        <dt className="text-slate-500">주소</dt>
                        <dd className="text-slate-800">{office.addressText}</dd>
                      </div>
                      <div className="grid grid-cols-[5.5rem_1fr] gap-3">
                        <dt className="text-slate-500">최종 확인</dt>
                        <dd className="text-slate-800">
                          {dateFormatter.format(office.lastVerifiedAt)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-auto flex flex-wrap gap-3 pt-6">
                      <Link
                        href={`/offices/${office.slug}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
                      >
                        상세 정보
                      </Link>
                      <TrackedPhoneLink
                        officeId={office.id}
                        href={`tel:${office.phoneNormalized}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-800 hover:border-slate-950"
                      >
                        {office.phoneDisplay}
                      </TrackedPhoneLink>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-8 text-xs leading-5 text-slate-500">
            목록은 업체명 기준으로 정렬되며 추천·별점·품질 순위가 아닙니다.
            전화 연결에는 플랫폼 수수료가 없지만 통신사 요금이 발생할 수
            있습니다.
          </p>
        </div>
      </main>
  );
}

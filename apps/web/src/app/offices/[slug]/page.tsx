import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  OfficeDetailViewTracker,
  TrackedPhoneLink,
} from "@/modules/analytics/office-engagement";
import { getPublicOfficeBySlug } from "@/modules/directory/public-office-repository";
import { getAbsoluteUrl } from "@/modules/shared/site-url";

const getOffice = cache(getPublicOfficeBySlug);
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeZone: "Asia/Seoul",
});
const sourceTypeLabels: Record<string, string> = {
  official_website: "업체 공식 웹사이트",
  public_data: "정부·공공 데이터",
  official_social: "공식 소셜 프로필",
  manual_submission: "업체 제출 공개 자료",
  other_public_source: "기타 공개 출처",
};

type OfficeDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: OfficeDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const office = await getOffice(slug);

  if (!office) {
    return {
      title: "업체 정보를 찾을 수 없습니다",
      robots: { index: false, follow: false },
    };
  }

  const description =
    office.summary ??
    `${office.region.name} ${office.name}의 주소, 전화번호, 업무 분야와 정보 출처를 확인하세요.`;

  return {
    title: office.name,
    description,
    alternates: { canonical: `/offices/${office.slug}` },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName: "탐정사무소 정보 플랫폼",
      title: office.name,
      description,
      url: `/offices/${office.slug}`,
    },
  };
}

export default async function OfficeDetailPage({
  params,
}: OfficeDetailPageProps) {
  const { slug } = await params;
  const office = await getOffice(slug);

  if (!office) {
    notFound();
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${getAbsoluteUrl(`/offices/${office.slug}`)}#office`,
    name: office.name,
    url: getAbsoluteUrl(`/offices/${office.slug}`),
    telephone: office.phoneDisplay,
    address: {
      "@type": "PostalAddress",
      streetAddress: office.addressText,
      addressCountry: "KR",
    },
    ...(office.summary ? { description: office.summary } : {}),
  };

  return (
    <main className="flex-1">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <OfficeDetailViewTracker officeId={office.id} />
      <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
        <nav aria-label="현재 위치" className="text-sm text-slate-500">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-slate-950">
                홈
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/offices" className="hover:text-slate-950">
                업체 찾기
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-slate-700">
              {office.name}
            </li>
          </ol>
        </nav>

        <header className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)] sm:p-10">
          <div className="flex flex-wrap gap-2">
            {office.categories.map((category) => (
              <Link
                key={category.slug}
                href={`/offices?category=${category.slug}`}
                className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
              >
                {category.name}
              </Link>
            ))}
          </div>
          <p className="mt-6 text-sm font-bold text-sky-800">
            {office.region.name}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
            {office.name}
          </h1>
          {office.summary && (
            <p className="mt-6 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              {office.summary}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-7">
            <TrackedPhoneLink
              officeId={office.id}
              href={`tel:${office.phoneNormalized}`}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-base font-bold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            >
              무료 전화 연결 · {office.phoneDisplay}
            </TrackedPhoneLink>
            <p className="text-xs leading-5 text-slate-500">
              플랫폼 연결 수수료 없음 · 통신사 요금은 발생할 수 있음
            </p>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-[-0.025em]">업체 정보</h2>
            <dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100">
              <div className="grid gap-2 py-5 sm:grid-cols-[8rem_1fr]">
                <dt className="text-sm font-semibold text-slate-500">주소</dt>
                <dd className="text-sm leading-6 text-slate-900">
                  {office.addressText}
                </dd>
              </div>
              <div className="grid gap-2 py-5 sm:grid-cols-[8rem_1fr]">
                <dt className="text-sm font-semibold text-slate-500">
                  대표 전화
                </dt>
                <dd className="text-sm leading-6 text-slate-900">
                  {office.phoneDisplay}
                </dd>
              </div>
              <div className="grid gap-2 py-5 sm:grid-cols-[8rem_1fr]">
                <dt className="text-sm font-semibold text-slate-500">
                  업무 분야
                </dt>
                <dd className="text-sm leading-6 text-slate-900">
                  {office.categories.map((category) => category.name).join(", ")}
                </dd>
              </div>
              <div className="grid gap-2 py-5 sm:grid-cols-[8rem_1fr]">
                <dt className="text-sm font-semibold text-slate-500">
                  최종 확인일
                </dt>
                <dd className="text-sm leading-6 text-slate-900">
                  {dateFormatter.format(office.lastVerifiedAt)}
                </dd>
              </div>
            </dl>
          </section>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white sm:p-7">
            <h2 className="text-lg font-bold">정보 출처</h2>
            <p className="mt-2 text-xs leading-5 text-slate-300">
              아래 공개 출처를 확인한 뒤 운영자가 승인한 정보입니다.
            </p>
            <ul className="mt-5 space-y-4">
              {office.sources.map((source) => (
                <li key={source.url} className="border-t border-slate-700 pt-4">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-sky-200 underline decoration-sky-700 underline-offset-4 hover:text-white"
                  >
                    {sourceTypeLabels[source.sourceType] ?? "공개 출처"}
                    {source.isPrimary ? " · 대표" : ""}
                    <span className="sr-only"> 새 창에서 열기</span>
                  </a>
                  <p className="mt-2 text-xs text-slate-400">
                    확인 {dateFormatter.format(source.verifiedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-950">
          <h2 className="font-bold">이용 전 확인해 주세요</h2>
          <p className="mt-2">
            이 페이지는 공개 정보 디렉터리이며 특정 업체의 업무 적법성, 품질,
            성과를 보증하지 않습니다. 상담 시에도 사건 내용이나 조사 대상자
            개인정보를 온라인에 남기지 마세요.
          </p>
          <p className="mt-3">
            업체명, 전화번호, 주소 또는 소개가 실제 공개 정보와 다른가요?{" "}
            <Link
              href={`/offices/${office.slug}/correction`}
              className="font-bold underline decoration-amber-400 underline-offset-4 hover:text-sky-900"
            >
              정보 수정 요청
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

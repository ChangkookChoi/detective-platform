import type { Metadata } from "next";
import Link from "next/link";

import { getSiteUrl } from "@/modules/shared/site-url";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "탐정사무소 정보 플랫폼",
    template: "%s | 탐정사무소 정보 플랫폼",
  },
  description:
    "서울·경기 지역 탐정사무소의 검수된 정보와 출처를 확인하는 정보 플랫폼입니다.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "탐정사무소 정보 플랫폼",
    title: "탐정사무소 정보 플랫폼",
    description:
      "서울·경기 지역 탐정사무소의 검수된 정보와 출처를 확인하는 정보 플랫폼입니다.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-stone-50 text-slate-950">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-sky-600"
        >
          본문으로 건너뛰기
        </a>
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
              <Link
                href="/"
                className="text-base font-bold tracking-[-0.025em] text-slate-950"
              >
                탐정사무소 정보
              </Link>
              <nav aria-label="주요 메뉴">
                <Link
                  href="/offices"
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-950 hover:bg-slate-950 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                >
                  업체 찾기
                </Link>
              </nav>
            </div>
          </header>
          <div
            id="main-content"
            tabIndex={-1}
            className="flex flex-1 flex-col outline-none"
          >
            {children}
          </div>
          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto w-full max-w-6xl px-5 py-8 text-sm leading-6 text-slate-600 sm:px-8">
              <p className="font-semibold text-slate-800">
                탐정사무소 정보 플랫폼
              </p>
              <p className="mt-2 max-w-3xl">
                공개 출처를 바탕으로 검수된 정보를 제공하며, 특정 업체의
                적법성·품질·성과를 보증하거나 추천하지 않습니다. 사건 내용과
                조사 대상자 정보는 수집하지 않습니다.
              </p>
              <nav
                aria-label="서비스 안내"
                className="mt-5 flex flex-wrap gap-x-5 gap-y-2"
              >
                <Link href="/guide" className="font-semibold hover:text-slate-950">
                  이용 안내
                </Link>
                <Link href="/privacy" className="font-semibold hover:text-slate-950">
                  개인정보 처리방침
                </Link>
                <Link
                  href="/advertising"
                  className="font-semibold hover:text-slate-950"
                >
                  광고 표시 정책
                </Link>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}

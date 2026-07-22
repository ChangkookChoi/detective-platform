import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider, UserButton } from "@clerk/nextjs";

import { requireReviewer } from "@/modules/auth/admin-authorization";

export const metadata: Metadata = {
  title: {
    default: "관리자",
    template: "%s | 관리자",
  },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const principal = await requireReviewer("/admin/reviews");

  return (
    <ClerkProvider>
      <div className="flex flex-1 flex-col bg-slate-100">
        <header className="border-b border-slate-800 bg-slate-950 text-white">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8">
            <div className="flex items-center gap-6">
              <Link href="/admin/reviews" className="font-bold tracking-[-0.02em]">
                운영 관리자
              </Link>
              <nav aria-label="관리자 메뉴">
                <Link
                  href="/admin/reviews"
                  className="text-sm font-semibold text-slate-300 hover:text-white"
                >
                  검수 대기열
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
                {principal.role === "admin" ? "관리자" : "검수자"}
              </span>
              <UserButton />
            </div>
          </div>
        </header>
        {children}
      </div>
    </ClerkProvider>
  );
}

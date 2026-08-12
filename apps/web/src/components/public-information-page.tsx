import Link from "next/link";
import type { ReactNode } from "react";

export function PublicInformationPage({
  eyebrow,
  title,
  description,
  updatedAt,
  notice,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-16">
        <nav aria-label="현재 위치" className="text-sm text-slate-500">
          <Link href="/" className="hover:text-slate-950">
            홈
          </Link>
          <span aria-hidden="true" className="mx-2">
            /
          </span>
          <span aria-current="page">{title}</span>
        </nav>

        <header className="mt-8 border-b border-slate-200 pb-9">
          <p className="text-sm font-bold tracking-[0.14em] text-sky-800">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-600">
            {description}
          </p>
          <p className="mt-4 text-xs text-slate-500">
            기준일 <time dateTime={updatedAt}>{updatedAt}</time>
          </p>
        </header>

        {notice && (
          <aside className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
            {notice}
          </aside>
        )}

        <div className="mt-10 space-y-10 text-sm leading-7 text-slate-700 sm:text-base">
          {children}
        </div>
      </div>
    </main>
  );
}

export function InformationSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-bold tracking-[-0.025em] text-slate-950 sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function InformationList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-sky-700">{children}</ul>;
}

import Link from "next/link";

export default function OfficesNotFound() {
  return (
    <main className="flex flex-1 items-center">
      <div className="mx-auto w-full max-w-2xl px-5 py-20 text-center sm:px-8">
        <p className="text-sm font-bold tracking-[0.14em] text-sky-800">404</p>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em]">
          업체 정보를 찾을 수 없습니다.
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          공개되지 않은 업체이거나 올바르지 않은 검색 조건입니다. 공개 업체
          목록에서 다시 확인해 주세요.
        </p>
        <Link
          href="/offices"
          className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white hover:bg-sky-800"
        >
          업체 목록으로 이동
        </Link>
      </div>
    </main>
  );
}

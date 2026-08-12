import type { Metadata } from "next";
import { ClerkProvider, SignIn } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "관리자 로그인",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <ClerkProvider>
      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
        <div className="grid w-full max-w-4xl gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
          <section>
            <p className="text-sm font-bold tracking-[0.14em] text-sky-800">
              STAFF ONLY
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
              관리자 로그인
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
              사전에 허용된 운영 계정만 접근할 수 있습니다. 검수 동작은 처리자,
              시각과 사유가 감사 이력에 기록됩니다.
            </p>
          </section>
          <SignIn
            routing="path"
            path="/sign-in"
            fallbackRedirectUrl="/admin/reviews"
            withSignUp={false}
          />
        </div>
      </main>
    </ClerkProvider>
  );
}

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextMiddleware } from "next/server";

import {
  isClerkConfigured,
  isClerkOnlyPath,
} from "@/modules/auth/clerk-configuration";

const configuredClerkMiddleware = isClerkConfigured()
  ? clerkMiddleware()
  : null;

const proxy: NextMiddleware = (request, event) => {
  if (configuredClerkMiddleware) {
    return configuredClerkMiddleware(request, event);
  }

  if (isClerkOnlyPath(request.nextUrl.pathname)) {
    return new NextResponse("관리자 인증이 아직 구성되지 않았습니다.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "3600",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  return NextResponse.next();
};

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};

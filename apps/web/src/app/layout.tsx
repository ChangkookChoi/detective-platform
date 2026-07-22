import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "탐정사무소 정보 플랫폼",
  description:
    "서울·경기 지역 탐정사무소의 검수된 정보와 출처를 확인하는 정보 플랫폼입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

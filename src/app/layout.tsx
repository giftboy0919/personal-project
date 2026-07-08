import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "통합 라이프 대시보드 · AI 목표 플래너",
  description:
    "큰 목표를 입력하면 AI가 오늘부터 기한까지 일간 단위 실행 계획으로 쪼개줍니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

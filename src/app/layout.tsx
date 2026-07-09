import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "통합 라이프 대시보드",
  description:
    "가계부 · 캘린더 · AI 목표 플래너를 한 화면에서. 큰 목표를 일간 단위 계획으로 쪼개고, 월/주/일 캘린더에서 할 일·일정·지출을 한눈에.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}

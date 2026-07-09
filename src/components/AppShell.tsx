"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import LoginForm from "./LoginForm";

const NAV = [
  { href: "/", label: "오늘" },
  { href: "/ledger", label: "가계부" },
  { href: "/schedule", label: "캘린더" },
  { href: "/planner", label: "AI 플래너" },
  { href: "/plans", label: "저장한 계획" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { session, loading, email, signOut } = useAuth();
  const pathname = usePathname();

  // Supabase 미설정: 데모 모드 — 로그인 없이 앱을 그대로 보여준다(데이터 기능은 각 페이지가 안내).
  const demoMode = !isSupabaseConfigured;

  if (!demoMode && loading) {
    return (
      <div className="page" style={{ textAlign: "center", paddingTop: 80 }}>
        <span className="spinner" style={{ borderColor: "var(--border)", borderTopColor: "var(--brand)" }} />
      </div>
    );
  }

  // 설정됐지만 로그인 안 함 → 로그인 화면(내비 없음)
  if (!demoMode && !session) {
    return <LoginForm />;
  }

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-brand">
            🗓️ 라이프 대시보드
          </Link>
          <div className="nav-links">
            {NAV.map((n) => {
              const active =
                n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`nav-link${active ? " active" : ""}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
          <div className="nav-right">
            {demoMode ? (
              <span className="nav-demo">데모 모드</span>
            ) : (
              <>
                <span className="nav-email">{email}</span>
                <button className="nav-signout" onClick={() => signOut()}>
                  로그아웃
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}

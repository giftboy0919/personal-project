"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import type { SavedPlanRow } from "@/lib/types";

function progressOf(row: SavedPlanRow): number {
  const total = row.result?.dailyPlan?.length ?? 0;
  if (total === 0) return 0;
  const done = Array.isArray(row.done_tasks) ? row.done_tasks.length : 0;
  return Math.round((done / total) * 100);
}

export default function PlansListPage() {
  const [rows, setRows] = useState<SavedPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase
      .from("plans")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: dbError }) => {
        if (dbError) setError(dbError.message);
        else setRows((data as SavedPlanRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <main className="page">
      <div className="topbar">
        <Link href="/" className="back-link">
          ← 새 계획 만들기
        </Link>
      </div>

      <header className="hero">
        <span className="badge">저장한 계획</span>
        <h1>내 목표 계획 목록</h1>
        <p>저장한 계획을 눌러 오늘 할 일을 체크하고 진행률을 관리하세요.</p>
      </header>

      {!isSupabaseConfigured ? (
        <div className="card">
          <p className="save-note">
            Supabase 환경변수(<code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>)를 설정하면 저장한 계획을 볼 수
            있습니다.
          </p>
        </div>
      ) : loading ? (
        <div className="card">
          <p className="save-note">불러오는 중…</p>
        </div>
      ) : error ? (
        <div className="card">
          <p className="error">불러오기 실패: {error}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <p className="save-note">
            아직 저장한 계획이 없어요. <Link href="/">첫 계획 만들러 가기 →</Link>
          </p>
        </div>
      ) : (
        <div className="results">
          {rows.map((row) => {
            const pct = progressOf(row);
            return (
              <Link href={`/plans/${row.id}`} key={row.id} className="plan-card-link">
                <div className="card plan-card">
                  <div className="plan-card-head">
                    <div className="plan-goal">{row.goal}</div>
                    <span className="plan-pct">{pct}%</span>
                  </div>
                  <div className="progress">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="plan-meta">
                    🎯 기한 {row.deadline} · 🗓 저장{" "}
                    {new Date(row.created_at).toLocaleDateString("ko-KR")}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <footer className="footer">통합 라이프 대시보드</footer>
    </main>
  );
}

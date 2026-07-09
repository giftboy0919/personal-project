"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import TodoList from "@/components/TodoList";
import type { ScheduleItemRow, TransactionRow } from "@/lib/types";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function shiftDate(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function prettyDate(iso: string) {
  const d = new Date(iso);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd})`;
}
const won = (n: number) => n.toLocaleString("ko-KR") + "원";

export default function HomeDashboard() {
  const { session, loading: authLoading } = useAuth();
  const [date, setDate] = useState(isoToday());
  const [schedule, setSchedule] = useState<ScheduleItemRow[]>([]);
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    const [s, x] = await Promise.all([
      supabase.from("schedule_items").select("*").eq("date", date).order("start_time"),
      supabase.from("transactions").select("*").eq("date", date).order("created_at"),
    ]);
    setSchedule((s.data as ScheduleItemRow[]) ?? []);
    setTxns((x.data as TransactionRow[]) ?? []);
    setLoading(false);
  }, [date, session]);

  useEffect(() => {
    load();
  }, [load]);

  // 데모 모드(Supabase 미설정): 환영 + AI 플래너 안내
  if (!isSupabaseConfigured) {
    return (
      <main className="page">
        <header className="hero">
          <span className="badge">통합 라이프 대시보드</span>
          <h1>가계부 · 캘린더 · 플래너를 한 화면에</h1>
          <p>
            지금은 <b>데모 모드</b>입니다. Supabase를 연결하면 로그인·저장 기능이 켜집니다.
            먼저 AI 플래너를 체험해보세요.
          </p>
        </header>
        <div className="card" style={{ textAlign: "center" }}>
          <Link className="btn btn-primary" href="/planner" style={{ maxWidth: 280, margin: "0 auto" }}>
            ✨ AI 목표 플래너 써보기
          </Link>
        </div>
        <footer className="footer">통합 라이프 대시보드</footer>
      </main>
    );
  }

  if (authLoading) return null;

  const income = txns.filter((t) => t.type === "income").reduce((a, b) => a + Number(b.amount), 0);
  const expense = txns.filter((t) => t.type === "expense").reduce((a, b) => a + Number(b.amount), 0);

  return (
    <main className="page">
      <header className="dash-head">
        <div>
          <h1 className="dash-title">{prettyDate(date)}</h1>
          <p className="dash-sub">오늘의 일정 · 할 일 · 지출을 한눈에</p>
        </div>
        <div className="date-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, -1))}>‹</button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || isoToday())}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, 1))}>›</button>
          {date !== isoToday() && (
            <button className="btn btn-ghost btn-sm" onClick={() => setDate(isoToday())}>오늘</button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="card"><p className="save-note">불러오는 중…</p></div>
      ) : (
        <div className="dash-grid">
          {/* 일정 */}
          <div className="card">
            <div className="card-head">
              <h2 className="section-title">🗓 오늘 일정</h2>
              <Link href={`/schedule?view=day&date=${date}`} className="mini-link">캘린더 →</Link>
            </div>
            {schedule.length === 0 ? (
              <p className="empty">등록된 일정이 없어요.</p>
            ) : (
              schedule.map((s) => (
                <div className="sched-row" key={s.id}>
                  <span className="sched-time">
                    {s.start_time ? s.start_time.slice(0, 5) : "–"}
                    {s.end_time ? `~${s.end_time.slice(0, 5)}` : ""}
                  </span>
                  <div>
                    <div className="sched-title">{s.title}</div>
                    {s.location && <div className="sched-loc">📍 {s.location}</div>}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 할 일 (수동 tasks + 저장한 계획의 그날 항목을 자동 표시) */}
          <TodoList date={date} />

          {/* 가계부 */}
          <div className="card">
            <div className="card-head">
              <h2 className="section-title">💰 오늘 가계부</h2>
              <Link href="/ledger" className="mini-link">관리 →</Link>
            </div>
            <div className="ledger-summary">
              <div>
                <span className="ls-label">수입</span>
                <span className="amount income">+{won(income)}</span>
              </div>
              <div>
                <span className="ls-label">지출</span>
                <span className="amount expense">-{won(expense)}</span>
              </div>
              <div>
                <span className="ls-label">합계</span>
                <span className={`amount ${income - expense >= 0 ? "income" : "expense"}`}>
                  {income - expense >= 0 ? "+" : "-"}{won(Math.abs(income - expense))}
                </span>
              </div>
            </div>
            {txns.length === 0 ? (
              <p className="empty">기록된 거래가 없어요.</p>
            ) : (
              txns.map((x) => (
                <div className="txn-row" key={x.id}>
                  <span className="txn-cat">{x.category || (x.type === "income" ? "수입" : "지출")}</span>
                  <span className="txn-memo">{x.memo}</span>
                  <span className={`amount ${x.type}`}>
                    {x.type === "income" ? "+" : "-"}{won(Number(x.amount))}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <footer className="footer">통합 라이프 대시보드</footer>
    </main>
  );
}

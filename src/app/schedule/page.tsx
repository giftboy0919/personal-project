"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import type { ScheduleItemRow } from "@/lib/types";

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

export default function SchedulePage() {
  const { session, loading: authLoading } = useAuth();
  const [date, setDate] = useState(isoToday());
  const [rows, setRows] = useState<ScheduleItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    const { data } = await supabase
      .from("schedule_items")
      .select("*")
      .eq("date", date)
      .order("start_time", { ascending: true, nullsFirst: true });
    setRows((data as ScheduleItemRow[]) ?? []);
    setLoading(false);
  }, [date, session]);

  useEffect(() => {
    load();
  }, [load]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("schedule_items").insert({
      date,
      title: title.trim(),
      start_time: startTime || null,
      end_time: endTime || null,
      location: location.trim() || null,
    });
    setBusy(false);
    if (!error) {
      setTitle("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      load();
    }
  }

  async function del(id: string) {
    if (!supabase) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("schedule_items").delete().eq("id", id);
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="page">
        <div className="card">
          <p className="save-note">시간표를 쓰려면 Supabase 연결(로그인)이 필요합니다.</p>
        </div>
      </main>
    );
  }
  if (authLoading) return null;

  return (
    <main className="page">
      <header className="dash-head">
        <div>
          <h1 className="dash-title">시간표</h1>
          <p className="dash-sub">{prettyDate(date)}</p>
        </div>
        <div className="date-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, -1))}>‹</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || isoToday())} />
          <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, 1))}>›</button>
          {date !== isoToday() && (
            <button className="btn btn-ghost btn-sm" onClick={() => setDate(isoToday())}>오늘</button>
          )}
        </div>
      </header>

      <form className="card" onSubmit={addItem}>
        <div className="field">
          <label>일정 제목</label>
          <input placeholder="예: 자료구조 강의 / 팀 회의" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="row">
          <div className="field">
            <label>시작 <span className="hint">(선택)</span></label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field">
            <label>종료 <span className="hint">(선택)</span></label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>장소 <span className="hint">(선택)</span></label>
          <input placeholder="공학관 301 / 온라인" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : "일정 추가"}
        </button>
      </form>

      <div className="results">
        <div className="card">
          <h2 className="section-title">이 날의 일정</h2>
          {loading ? (
            <p className="save-note">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="empty">등록된 일정이 없어요.</p>
          ) : (
            rows.map((s) => (
              <div className="sched-row full" key={s.id}>
                <span className="sched-time">
                  {s.start_time ? s.start_time.slice(0, 5) : "종일"}
                  {s.end_time ? `~${s.end_time.slice(0, 5)}` : ""}
                </span>
                <div className="sched-body">
                  <div className="sched-title">{s.title}</div>
                  {s.location && <div className="sched-loc">📍 {s.location}</div>}
                </div>
                <button className="task-del" onClick={() => del(s.id)} aria-label="삭제">✕</button>
              </div>
            ))
          )}
        </div>
      </div>

      <footer className="footer">통합 라이프 대시보드</footer>
    </main>
  );
}

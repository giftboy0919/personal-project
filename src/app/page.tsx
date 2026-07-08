"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/auth";
import type {
  SavedPlanRow,
  ScheduleItemRow,
  TaskRow,
  TransactionRow,
} from "@/lib/types";

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
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [txns, setTxns] = useState<TransactionRow[]>([]);
  const [plans, setPlans] = useState<SavedPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true);
    const [s, t, x, p] = await Promise.all([
      supabase.from("schedule_items").select("*").eq("date", date).order("start_time"),
      supabase.from("tasks").select("*").eq("date", date).order("created_at"),
      supabase.from("transactions").select("*").eq("date", date).order("created_at"),
      // 저장한 계획 전체를 받아, 이 날짜에 해당하는 일자별 항목을 자동으로 끌어온다
      supabase.from("plans").select("id, goal, result, done_tasks"),
    ]);
    setSchedule((s.data as ScheduleItemRow[]) ?? []);
    setTasks((t.data as TaskRow[]) ?? []);
    setTxns((x.data as TransactionRow[]) ?? []);
    setPlans((p.data as SavedPlanRow[]) ?? []);
    setLoading(false);
  }, [date, session]);

  // 저장한 계획들에서 '선택한 날짜'의 dailyPlan 항목만 뽑아 오늘 할 일로 자동 노출
  const planItems = useMemo(() => {
    const items: {
      planId: string;
      goal: string;
      index: number;
      title: string;
      done: boolean;
    }[] = [];
    for (const p of plans) {
      const dp = p.result?.dailyPlan ?? [];
      dp.forEach((d, i) => {
        if (d.date === date) {
          items.push({
            planId: p.id,
            goal: p.goal,
            index: i,
            title: d.title,
            done: (p.done_tasks ?? []).includes(i),
          });
        }
      });
    }
    return items;
  }, [plans, date]);

  // 계획 항목 체크 → 해당 계획의 done_tasks 를 갱신(단일 소스: 계획 상세와 동기화됨)
  async function togglePlanItem(planId: string, index: number) {
    if (!supabase) return;
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const set = new Set(plan.done_tasks ?? []);
    if (set.has(index)) set.delete(index);
    else set.add(index);
    const next = [...set].sort((a, b) => a - b);
    setPlans((prev) =>
      prev.map((p) => (p.id === planId ? { ...p, done_tasks: next } : p)),
    );
    await supabase.from("plans").update({ done_tasks: next }).eq("id", planId);
  }

  useEffect(() => {
    load();
  }, [load]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !newTask.trim()) return;
    const title = newTask.trim();
    setNewTask("");
    const { data } = await supabase
      .from("tasks")
      .insert({ date, title })
      .select("*")
      .single();
    if (data) setTasks((prev) => [...prev, data as TaskRow]);
  }

  async function toggleTask(task: TaskRow) {
    if (!supabase) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
    );
    await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
  }

  async function deleteTask(id: string) {
    if (!supabase) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  }

  // 데모 모드(Supabase 미설정): 환영 + AI 플래너 안내
  if (!isSupabaseConfigured) {
    return (
      <main className="page">
        <header className="hero">
          <span className="badge">통합 라이프 대시보드</span>
          <h1>가계부 · 시간표 · 플래너를 한 화면에</h1>
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
  const doneCount = tasks.filter((t) => t.done).length;

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
          {/* 시간표 */}
          <div className="card">
            <div className="card-head">
              <h2 className="section-title">🗓 오늘 일정</h2>
              <Link href="/schedule" className="mini-link">관리 →</Link>
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

          {/* 할 일 */}
          <div className="card">
            <div className="card-head">
              <h2 className="section-title">✅ 할 일 · {doneCount}/{tasks.length}</h2>
            </div>
            {tasks.map((t) => (
              <div className={`task-row${t.done ? " done" : ""}`} key={t.id}>
                <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} />
                <span className="task-title">{t.title}</span>
                <button className="task-del" onClick={() => deleteTask(t.id)} aria-label="삭제">✕</button>
              </div>
            ))}

            {planItems.length > 0 && (
              <div className="plan-items">
                <div className="plan-items-h">📋 계획에서 온 오늘 항목</div>
                {planItems.map((it) => (
                  <div
                    className={`task-row${it.done ? " done" : ""}`}
                    key={`${it.planId}-${it.index}`}
                  >
                    <input
                      type="checkbox"
                      checked={it.done}
                      onChange={() => togglePlanItem(it.planId, it.index)}
                    />
                    <span className="task-title">
                      {it.title}
                      <span className="plan-src">· {it.goal}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tasks.length === 0 && planItems.length === 0 && (
              <p className="empty">오늘 할 일이 없어요. 아래에 추가하거나 계획을 저장해보세요.</p>
            )}

            <form onSubmit={addTask} className="task-add">
              <input
                placeholder="+ 할 일 추가 후 Enter"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />
            </form>
          </div>

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
